# Meta marketing integration — implementation specification

**Status: L0 BUILT. Nothing deployed, no migration applied, nothing published.**

- **§10.0 (L0, read-only) — implemented.** See §15 for what shipped and what
  running it revealed. Never executed against the real Si Math configuration:
  `graph.facebook.com` is egress-blocked from the environment it was written
  in, so the first real run is yours.
- **§10.1 (L1) and §10.2 (L2) — NOT implemented, and gated on your approval of
  the L0 results.** No publish path, no ads write path, and no media-container
  code exists in the repository.
- Everything else below remains a specification to approve or amend.

Written against the repository on branch `claude/si-math-meta-api-qmej6e`
(inspected 2026-08-21).

Graph API facts below were checked against public sources on 2026-08-21 and are
cited inline. `developers.facebook.com` is blocked by this environment's egress
proxy, so **every endpoint path and permission name here must be confirmed
against the live reference before it is coded.** Where I could not verify
something, it says so rather than guessing.

---

## 0. What the repository actually contains today

Grounding first, because the design follows from it.

| Finding | Consequence for this work |
|---|---|
| `grep -rniE "graph\.facebook\|instagram\|META_\|FB_\|IG_"` over `*.ts,*.mjs,*.js,*.md,*.sh` returns **zero** integration hits | Greenfield. Nothing to extend, nothing to break. |
| **No `package.json`, no bundler, no build step** — deliberate (CLAUDE.md, "Repository shape") | `facebook-nodejs-business-sdk` is **ruled out.** It is npm-only and would introduce the build step the repo exists without. We hand-roll a thin `fetch` client. See §2.3. |
| `supabase/functions/_shared/support-zoom.core.ts` + `support-provider.core.ts` + `support-actions/index.ts` | **This is the pattern to copy.** A third-party vendor with OAuth secrets, an injectable `fetchImpl`, an env reader that returns `null` when unconfigured, an error mapper that never relays upstream bodies, and a redaction allow-list. Meta is the same problem with a different vendor. |
| `supabase/functions/_shared/cors.ts` — exact-match origin allow-list, `isBlockedOrigin()` | Reuse verbatim. Do not write a second CORS policy. |
| `tests/support-isolation.test.mjs` drives the real adapter with a stub fetch | The Meta suite does the same: full coverage, no network, no ad account, no spend. |
| `tests/run-all.mjs` auto-discovers `tests/*.test.mjs` and `scripts/validate-*.mjs` | New suites are picked up with **no CI change**. `NEEDS_TS` in `run-all.mjs` is the one line that must be edited (§3). |
| `ai-tutor/index.ts` is ~292 KB / frozen deploy path, two prior outages | **Nothing marketing-related goes near `ai-tutor`.** See §2.1. |
| Migrations are PREPARED → reviewed → explicitly approved → APPLIED (CLAUDE.md §3) | The audit tables in §12 ship as unapplied files. Writing them is not applying them. |

---

## 1. ⛔ Blockers — the Meta side is not ready, and code cannot fix it

You listed the System User (`61593218806694`, Employee) as holding **two**
assets: the *Si Math* Facebook Page and the *Si Math* Meta App. Of the six
capabilities you asked for, that set supports **one and a half**.

| # | Capability | Blocked by | Fixed where |
|---|---|---|---|
| 1 | Publish/manage FB Page content | — (Page is assigned) | ready, pending permissions |
| 2 | Publish/manage Instagram | **No Instagram account assigned to the System User**, and it must be a **Professional (Business/Creator)** account **linked to the Si Math Page** | Business Settings → Accounts → Instagram accounts |
| 3 | Create/manage ads | **No Ad Account assigned to the System User** | Business Settings → Accounts → Ad accounts → Assign partner/people |
| 4 | Read ad performance | same as #3 | same |
| 5 | Use Page + IG as publishing assets | #2 | same |
| 6 | Keep credentials secure | — | §8, §9 |

Three further gates that are administrative, not technical, and that have long
lead times — start them **before** the code, because they gate the token's
scopes, not the code's correctness:

- **Business verification** of the Business Portfolio that owns the app.
- **App Review / Advanced Access** for `instagram_content_publish`,
  `pages_manage_posts`, and `ads_management`. Without Advanced Access the app
  is capped at admins/developers/testers of the app — publishing to a real
  audience will not work. Instagram content publishing in particular requires
  App Review for production use beyond test users.
- **App must be owned by the Business Portfolio**, not by a personal account,
  or System User tokens cannot be issued against it.

The System User's role is **Employee**. Employee is normally sufficient for
asset-scoped API work, but ad-account *creation* and some business-level
management calls require **Admin**. If we only ever operate an existing ad
account, Employee is correct and is the safer choice — keep it unless a
specific call returns a permission error naming business management.

**Recommendation: do not write the ads half of this integration until the ad
account is assigned and Advanced Access is granted.** Ship the Page half
first (§10), which needs the least.

---

## 2. Architecture

### 2.1 A new Edge Function — `marketing-actions`. Never `ai-tutor`.

Marketing code must not be able to take Zero down. `ai-tutor` is ~292 KB, has
a frozen deploy path, and has caused two student-facing outages from deploy
accidents alone. A marketing bug that shares its process is a marketing bug
that can 500 every student mid-exam-prep.

Separate function = separate isolate, separate deploy, separate secrets,
separate blast radius. The cost is one more manual deploy step; the benefit is
that the worst marketing outage is "no post went out today".

This also mirrors what the repo already decided for `support-actions` and
`admin-actions`.

### 2.2 Why a server boundary at all, rather than calling Meta from a script

Three reasons, all of which have precedent in `support-actions`' header:

1. **The System User token is a permanent, un-expiring, spend-authorising
   credential.** It must exist in exactly one place — Supabase Function
   secrets — and never in a browser, a repo, a CI log, or a chat message.
2. **Meta responses contain credentials.** Page objects can carry
   `access_token`; ad account objects carry business identifiers. Anything
   persisted must go through a redaction allow-list, exactly as
   `redactProviderRef()` does for Zoom's `start_url`.
3. **Ads move money.** The authorisation decision ("is this caller the owner?")
   has to happen somewhere the caller cannot edit.

### 2.3 No SDK. A thin pinned client.

`facebook-nodejs-business-sdk` is npm-only, ~megabytes, and would force a
`package.json` into a repo that has deliberately never had one. We write one
small module that does:

- URL construction against a **pinned** `META_GRAPH_VERSION`
- `appsecret_proof` on every call (§9.2)
- error mapping to fixed sentences (never relay Meta's body — it echoes
  request context and sometimes the token)
- cursor pagination
- an injectable `fetchImpl`, so tests execute the real bytes with no network

That is perhaps 200 lines and it is the whole dependency footprint.

### 2.4 Graph API version pinning is load-bearing

**Never call the unversioned endpoint.** Meta versions expire on roughly a
two-year clock, and a silently-floating version is a silent behaviour change.

Verified 2026-08-21: **v26.0 is current, released 2026-07-29**; v25.0 released
2026-02-18; **v20.0 is removed 2026-09-24** and v21.0 on 2027-01-21.

Pin to `v26.0` via `META_GRAPH_VERSION`, in an env var rather than a constant,
so a version bump is a secret change and a smoke test — not a code deploy.

**Relevant to capability #4:** from June 2026 Meta began retiring Post/Page
reach, video impressions and story impressions, replacing them with **Media
Views / Media Viewers** and a **Page Viewer** metric. Do not build the
performance reader against `impressions` and `reach` — it will report zeros or
error. Confirm the surviving metric names against the live reference at
implementation time.

---

## 3. Exact files to add and modify

Everything new. One existing file gets one line.

### Add — shared adapter layer

```
supabase/functions/_shared/meta-graph.core.ts
```
The only file that knows Meta's HTTP shape exists. Exports:
- `readMetaEnv(get)` → `MetaEnv | null` (null when unconfigured — never throw;
  an unconfigured marketing integration must be inert, not a 500)
- `appSecretProof(token, appSecret)` → hex string, via `crypto.subtle` HMAC-256
- `createMetaClient(env, fetchImpl = fetch)` → `{ get, post, del, paginate }`
- `metaErrorMessage(status, code, subcode)` → fixed sentence
- `MetaError extends Error`
- Graph error-code mapping worth special-casing: `190` (token invalid/expired),
  `4`/`17`/`32`/`613` (rate limit), `200`/`10` (permission), `368` (temporarily
  blocked)

```
supabase/functions/_shared/meta-publish.core.ts
```
Page + Instagram publishing. Pure logic over the client. Exports
`publishPagePost`, `publishPagePhoto`, `publishPageVideo`,
`publishInstagramImage`, `publishInstagramReel`, `publishInstagramCarousel`,
`pollContainer`, `deletePost`. **No secrets, no database.**

```
supabase/functions/_shared/meta-ads.core.ts
```
Campaign/adset/creative/ad construction and `insights` reads. Every write
defaults to `status: 'PAUSED'`. Exports a `validateOnly` mode (§10.2).

```
supabase/functions/_shared/meta-redact.core.ts
```
The allow-list. Same rationale as `support-provider.core.ts`: assume anything
persisted is readable by someone it should not be. Forbidden keys to assert on
in tests: `access_token`, `page_token`, `client_secret`, `app_secret`,
`appsecret_proof`, `business`, `funding_source_details`, `owner`, `users`.

### Add — the Edge Function

```
supabase/functions/marketing-actions/index.ts
```
Owner-only. Copies the auth gate from `support-actions/index.ts` lines ~110-130
(bearer → `auth.getUser()` → service-role read of `profiles.is_admin/role`)
but **narrower**: `role IN ('owner','super_admin')` only. An `admin` who can
approve payments should not necessarily be able to spend the ad budget.

Actions: `connection_check`, `page_publish`, `ig_publish`, `post_delete`,
`ads_read`, `campaign_create`, `campaign_pause`, `insights_read`.
Returns `{ok, status}` shapes; never the raw Meta payload.

### Add — scripts

```
scripts/meta-connection-check.mjs      # L0, read-only, §10.0
scripts/validate-meta-source.mjs       # CI gate, auto-discovered by run-all.mjs
scripts/deploy-marketing-actions.sh    # modelled on deploy-ai-tutor.sh
```

`validate-meta-source.mjs` is the gate that makes the safety rails real rather
than aspirational. It must fail on:
- any `graph.facebook.com` URL without `${version}` interpolation
- any hardcoded token-shaped literal (`EAA...`) anywhere in the tree
- any ads write whose default status is not `PAUSED`
- any `console.log` whose argument list can reach `META_SYSTEM_USER_TOKEN` or
  `META_APP_SECRET`

### Add — tests

```
tests/meta-graph.test.mjs        # client, appsecret_proof, error mapping, pagination
tests/meta-publish.test.mjs      # container flow, poll, publish, ordering
tests/meta-ads.test.mjs          # PAUSED default, validate_only, budget caps
tests/meta-isolation.test.mjs    # ⭐ the one that matters — see below
```

`meta-isolation.test.mjs` asserts the boundaries, in the style of
`support-isolation.test.mjs`, and every check must be able to go red:

1. **CREDENTIAL** — feed the redactor a payload containing every forbidden key
   and assert each is absent from the output. Not "a clean payload stays clean".
2. **ACADEMIC** — no marketing module imports or writes `question_records`,
   `mastery_records`, `weakness_*`, `focus_*`, `profiles` (beyond the role read),
   `chat_sessions`. Marketing must never touch the student record.
3. **SPEND** — no ads write path can produce `status: 'ACTIVE'` without an
   explicit caller opt-in *and* `META_ENABLE_ADS=true`.
4. **PUBLISH** — no publish path executes when `META_ENABLE_PUBLISH` is unset.
5. **VERSION** — every Graph URL in the shipped source is built from the pinned
   version variable; assert by regex over the real file bytes.

### Modify — exactly one line

```
tests/run-all.mjs
```
Add the new TS-reading suites to the `NEEDS_TS` regex:

```js
const NEEDS_TS = /scope-guardrail|zero-personality|edge-security|shared-cors|exam-strategy|verification-v0|verification-core-parity|entitlement-gate|v3-shadow-routing|meta-/;
```

No `.github/workflows/ci.yml` change is needed — `run-all.mjs` discovers by glob.

### Modify — documentation

- `DEPLOY.md` — a new §4.2 for `marketing-actions` (its own bundle, its own
  secrets, its own smoke test). Do **not** fold it into the `ai-tutor` section.
- `SECURITY.md` — a new finding class for the permanent token and its rotation
  procedure.
- `CLAUDE.md` — one row in the live-system table once deployed.

### Do NOT touch

`ai-tutor/index.ts`, `taxonomy.js`/`taxonomy.core.js` (frozen, transitive),
`regenerate-reports.js`, `exam-mistakes-logger.js`, `mock-exam.html`,
`weakness.html`, `focus.html`, and any public `*.html` page — CLAUDE.md §5
freezes the public knowledge layer, and a marketing integration is not a
product change to the learning platform.

---

## 4. Meta Graph API endpoints — Facebook Page

Base: `https://graph.facebook.com/{META_GRAPH_VERSION}`

### Identity and connection (read-only)
| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | who the token is — should resolve to the System User |
| GET | `/debug_token?input_token={t}` | scopes, `app_id`, `expires_at`, `data_access_expires_at`. **The single most useful diagnostic.** |
| GET | `/me/accounts` | Pages the token can act for |
| GET | `/{page-id}?fields=id,name,category,link,fan_count` | Page identity |
| GET | `/{page-id}?fields=instagram_business_account{id,username}` | **the IG linkage check** — if this is empty, capability #2 is not wired |
| GET | `/{business-id}/owned_ad_accounts` | ad accounts the portfolio owns |

### Publishing
| Method | Path | Notes |
|---|---|---|
| POST | `/{page-id}/feed` | text/link post. `message`, `link`. `published=false` creates an unpublished post — this is the §10.1 non-publishing test. |
| POST | `/{page-id}/photos` | image. `url` (public) or multipart `source`. `published=false` + returned `id` → attach to `/feed` for a controlled two-step. |
| POST | `/{page-id}/videos` | video. `file_url` for a hosted asset. Large files need the **Resumable Upload API**, not this. |
| POST | `/{page-id}/video_reels` | FB Reels — separate multi-step flow (initialise → upload → finish). Confirm the exact path against live docs; this one has changed. |
| DELETE | `/{post-id}` | the rollback for every test below |
| POST | `/{post-id}` | edit `message` on an existing post |

### Reading performance
| Method | Path | Notes |
|---|---|---|
| GET | `/{page-id}/insights?metric=...` | ⚠️ **`page_impressions` and reach metrics are being retired** (June 2026). Use the Media Views / Media Viewers / Page Viewer replacements. Verify names at build time. |
| GET | `/{post-id}/insights?metric=...` | per-post |
| GET | `/{page-id}/feed?fields=id,message,created_time,permalink_url` | what we have published |

### Page token nuance
A Page access token derived from a System User token inherits its
non-expiration. `/me/accounts` returns per-Page tokens; **prefer calling with
the System User token directly** where the asset is assigned, so there is one
credential to rotate rather than N.

---

## 5. Instagram Graph API endpoints

Base is the same host and version. The IG user id comes from
`/{page-id}?fields=instagram_business_account`.

Publishing is **container-then-publish**, never a single call
(verified 2026-08-21):

```
1. POST /{ig-user-id}/media            → {id: container_id}
2. GET  /{container_id}?fields=status_code,status   → poll until FINISHED
3. POST /{ig-user-id}/media_publish    (creation_id=container_id) → {id: media_id}
```

Step 2 is not optional for video/Reels. Publishing an `IN_PROGRESS` container
fails, and the failure mode is confusing enough that skipping the poll is the
most common cause of "it worked in testing".

| Method | Path | Params |
|---|---|---|
| POST | `/{ig-user-id}/media` | image: `image_url` (public), `caption` |
| POST | `/{ig-user-id}/media` | reel: `media_type=REELS`, `video_url`, `caption`, `cover_url`, `share_to_feed` |
| POST | `/{ig-user-id}/media` | carousel item: `is_carousel_item=true` |
| POST | `/{ig-user-id}/media` | carousel parent: `media_type=CAROUSEL`, `children=[ids]` |
| GET | `/{container-id}?fields=status_code` | `EXPIRED\|ERROR\|FINISHED\|IN_PROGRESS\|PUBLISHED` |
| POST | `/{ig-user-id}/media_publish` | `creation_id` |
| GET | `/{ig-user-id}/content_publishing_limit` | **quota check — call before every publish** |
| GET | `/{ig-user-id}/media` | published media |
| GET | `/{ig-media-id}/insights?metric=...` | per-post metrics (same retirement caveat as §4) |
| GET | `/{ig-user-id}/insights?metric=...&period=day` | account metrics |
| POST | `/{ig-media-id}/comments` | replying, if we want managed engagement |

**Hard constraints to encode in `meta-publish.core.ts`:**
- **50 published posts per 24 hours** per IG account (verified 2026-08-21).
  Read `content_publishing_limit` and refuse locally rather than discovering
  the cap as an API error.
- **`image_url` / `video_url` must be publicly fetchable by Meta's servers.**
  Higgsfield output URLs may be signed and/or short-lived. **This is the
  integration's most likely first failure.** Mitigation: copy the asset into
  Supabase Storage on a public bucket and hand Meta that URL. Add this as an
  explicit step in the pipeline, not an afterthought.
- Reels tab eligibility: 9:16, 5–90 s, H.264/HEVC. Worth validating client-side
  before spending a container.
- Containers expire after 24 h — the basis of the §10.1 non-publishing test.

---

## 6. Marketing API endpoints

Base: same host/version. Ad account ids are `act_{id}`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/act_{id}?fields=name,account_status,currency,timezone_name,amount_spent,balance,spend_cap` | **L0 sanity + the spend guard** |
| GET | `/act_{id}/campaigns?fields=name,objective,status,daily_budget` | list |
| POST | `/act_{id}/campaigns` | `name`, `objective` (e.g. `OUTCOME_TRAFFIC`, `OUTCOME_LEADS`), `status=PAUSED`, `special_ad_categories=[]` |
| POST | `/act_{id}/adsets` | `campaign_id`, `daily_budget`, `billing_event`, `optimization_goal`, `targeting`, `status=PAUSED` |
| POST | `/act_{id}/adcreatives` | `object_story_spec` referencing `page_id` (and `instagram_actor_id`/`instagram_user_id` for IG placements) |
| POST | `/act_{id}/ads` | `adset_id`, `creative`, `status=PAUSED` |
| POST | `/{campaign-id}` | `status=ACTIVE\|PAUSED` — the go-live switch, deliberately its own call |
| GET | `/act_{id}/insights` | performance |
| GET | `/{campaign-id}/insights` | per-campaign |
| DELETE | `/{object-id}` | cleanup |

**Insights parameters that matter:** `fields=impressions,clicks,spend,ctr,cpc,cpm,actions,cost_per_action_type`,
`date_preset` or `time_range`, `level=account|campaign|adset|ad`, `breakdowns`.
Large reports return an async job — `/act_{id}/insights` with
`POST` returns a `report_run_id` you poll. Build the reader to handle both.

**`execution_options=['validate_only']`** on any write validates the payload
without creating the object. This is the whole basis of the §10.2 test, and it
should be a first-class flag in `meta-ads.core.ts`, not a test-only hack.

**Targeting for Egypt / exam-prep:** `geo_locations.countries=['EG']`,
age range, and interest targeting. Note ads about education are not normally a
`special_ad_category`, but confirm — a wrong `special_ad_categories` value is a
rejected ad set, not a silent one.

---

## 7. Permissions / scopes

Requested on the System User token. **Confirm each name against the live
reference before requesting** — names have changed across versions.

**Facebook Page**
- `pages_show_list` — enumerate Pages
- `pages_read_engagement` — read Page content and metadata
- `pages_manage_posts` — **create/edit/delete posts** (Advanced Access needed)
- `pages_manage_engagement` — comments/reactions, only if we manage engagement
- `read_insights` — Page and post insights

**Instagram**
- `instagram_basic` — read profile/media
- `instagram_content_publish` — **publish** (Advanced Access + App Review)
- `instagram_manage_insights` — metrics
- `instagram_manage_comments` — only if managing comments

**Ads**
- `ads_management` — create/edit campaigns (Advanced Access + App Review)
- `ads_read` — read performance only

**Business**
- `business_management` — read/assign assets in the portfolio

**Principle of least privilege, and I recommend acting on it:** issue **two**
tokens, not one.

- `META_SYSTEM_USER_TOKEN` — publishing scopes + `ads_read`
- `META_ADS_TOKEN` — `ads_management`, used only by the ads path

A publishing bug then cannot spend money, and the ads token can be revoked
without taking the content pipeline down. The code cost is one extra env var
and one selector in `readMetaEnv()`.

---

## 8. Environment variables and secrets

All set via `supabase secrets set --project-ref igvkyxkmjnkzscqgommj`, exactly
as `ZOOM_*` is (`support-zoom.core.ts` header). **None committed. None in a
`.env` in the repo — `supabase/.gitignore` already ignores `.env*`, which is a
backstop, not a policy.** Never printed, never returned in a response body,
never logged.

### Secrets — Supabase Function secrets only
```
META_APP_ID                  # not secret, but configured together
META_APP_SECRET              # ⛔ secret. Used only for appsecret_proof.
META_SYSTEM_USER_TOKEN       # ⛔ secret. Permanent. Publishing + ads_read.
META_ADS_TOKEN               # ⛔ secret. Optional; ads_management only.
```

### Configuration — not secret, but environment-specific
```
META_GRAPH_VERSION=v26.0            # pinned; bump = secret change + smoke test
META_PAGE_ID                        # Si Math Facebook Page
META_IG_USER_ID                     # IG Professional account id (NOT the @handle)
META_AD_ACCOUNT_ID                  # act_XXXXXXXXX
META_BUSINESS_ID                    # Business Portfolio id
META_SYSTEM_USER_ID=61593218806694  # for assertion in the connection check
```

### Kill switches — default OFF, and this matters
```
META_ENABLE_PUBLISH=false    # no publish path executes while false
META_ENABLE_ADS=false        # no ads write executes while false
META_ADS_MAX_DAILY_BUDGET    # integer, account currency minor units. Hard ceiling.
META_DRY_RUN=true            # log the request that would be sent; send nothing
```

Note the **inversion** relative to `ALLOWED_ORIGINS` in `_shared/cors.ts`.
There, unset means permissive, because a fail-closed default would take the
tutor down for students. Here, unset means **inert**, because the failure mode
is "an unreviewed post went out to the public" or "money was spent". Different
blast radius, opposite default. `cors.ts`'s own header explains why its choice
is right for it; this is not a contradiction, and the reasoning should be
written into `meta-graph.core.ts`'s header so nobody "fixes" it later.

### Also needed by the function (already standard)
```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS
```

### Local operator use
`scripts/meta-connection-check.mjs` reads from the **process environment**, so
an operator exports them in a shell for one command. It must never write them
to a file and never echo them.

---

## 9. Token type for production

### 9.1 Use the System User access token. This is already the right answer.

You have the correct primitive. **System User tokens are non-expiring**,
are not tied to a human login, and survive password changes and staff
departures — which is precisely why they are the standard for Marketing API
backends (verified 2026-08-21).

The alternatives, and why not:

| Type | Why not |
|---|---|
| User access token | ~1–2 h. Useless unattended. |
| Long-lived user token | ~60 days. A guaranteed outage on a date nobody diarised. |
| Page access token from a *user* token | Inherits the user token's expiry and the user's continued employment. |
| **Graph API Explorer token** | Short-lived, tied to your login, scopes drift when you click around. **This is exactly the "temporary setup" you said you do not want.** |
| App access token | Cannot act as a Page or publish. |

**One important caveat to record now rather than discover later:** a System User
token is invalidated if the **app secret is regenerated**, if the System User is
removed, if its asset assignments are revoked, or if Meta forces a reset. So
"never expires" is not "never breaks". §11 covers detecting it.

### 9.2 `appsecret_proof` — required, not optional

Every server-side call must send `appsecret_proof`: `HMAC-SHA256(access_token)`
keyed with the **app secret**, hex-encoded. It proves the call came from a
server holding the app secret, so **a stolen token alone is not usable from
somewhere else.** Given the token never expires, this is the single most
valuable hardening available.

Deno has `crypto.subtle` — no dependency:

```ts
export async function appSecretProof(token: string, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

Also enable **"Require app secret proof for server API calls"** in the App
Dashboard, so a call missing it is rejected by Meta rather than merely
discouraged by us.

### 9.3 Rotation

Rotation is a secret update and a cold start — no deploy, no code change,
identical to the Zoom adapter's design ("a rotated secret takes effect on the
next cold start"). Document it in `DEPLOY.md` §4.2 and put a calendar reminder
on it; a credential that is never rotated because rotation was never written
down is the normal outcome.

---

## 10. The test ladder

Three rungs, in order, each with an explicit stop condition. **Do not proceed
to the next rung until the current one is green.**

### 10.0 — L0: read-only connection test (zero writes, zero risk)

`scripts/meta-connection-check.mjs`. Read-only Graph calls, no publish, no ad
write, no database. Safe to run repeatedly, safe to run before App Review, and
it is the diagnostic that will tell you which of §1's blockers are still open.

```
node scripts/meta-connection-check.mjs
```

Checks, in order, each printing PASS/FAIL and continuing:

1. env vars present (names only — **never print a value**)
2. `GET /debug_token` → token valid, `app_id` matches `META_APP_ID`,
   `expires_at == 0` (non-expiring), and **print the granted scope list** — this
   is what tells you whether App Review has landed
3. `GET /me` → id equals `META_SYSTEM_USER_ID` (`61593218806694`)
4. `GET /{META_PAGE_ID}?fields=id,name,category` → name is "Si Math"
5. `GET /{META_PAGE_ID}?fields=instagram_business_account` → **the IG blocker
   check.** Empty ⇒ capability #2/#5 not wired
6. `GET /{ig-user-id}?fields=id,username,account_type` → `BUSINESS` or `CREATOR`
7. `GET /{ig-user-id}/content_publishing_limit` → remaining quota of 50/24 h
8. `GET /act_{META_AD_ACCOUNT_ID}?fields=name,account_status,currency,spend_cap`
   → **the ads blocker check.** `account_status` must be 1 (ACTIVE)
9. `GET /act_{id}/campaigns?limit=1` → `ads_read` works
10. `appsecret_proof` accepted (implicit — every call above sends it)

**Exit non-zero with a checklist of what is missing.** This script is the
deliverable that turns §1's blocker list from my inference into your measured
fact.

### 10.1 — L1: non-publishing test (writes that nobody sees)

Only after L0 is fully green. Each of these exercises the **complete**
auth + upload + write path while producing nothing public.

| Surface | Test | Why nothing is published |
|---|---|---|
| **Instagram** | `POST /{ig-user-id}/media` with a real `image_url`, then poll `status_code` until `FINISHED`. **Do not call `media_publish`.** | A container is not a post. It expires unattended after 24 h. This proves auth, permissions, and — critically — **that Meta could fetch our image URL**, which is the §5 failure mode most likely to bite. |
| **Facebook Page** | `POST /{page-id}/feed` with `published=false`, capture the id, then `DELETE /{post-id}` immediately | An unpublished post is not on the Page. Deleting closes the loop and proves the delete path we need for rollback. |
| **Ads** | Any write with `execution_options=['validate_only']` | Meta validates the payload and creates nothing. Zero spend, full validation of targeting/creative/budget. |
| **Ads (read)** | `GET /act_{id}/insights?date_preset=last_30d` | Read-only; also confirms which metric names survived the June 2026 retirement. |

Run with `META_DRY_RUN=false` but `META_ENABLE_PUBLISH=false` — the kill switch
must still be off, because none of these call a publish endpoint. If any of
them fails while the switch is off, the switch is wired wrong.

### 10.2 — L2: first controlled publish

Only after L0 and L1 are green **and** you have explicitly approved the
specific creative and caption. This is the first thing real people see, so it
is a decision, not a test run.

**Sequence, one step per session, verified in the UI between steps:**

1. **Instagram, one image.** Set `META_ENABLE_PUBLISH=true`. Publish a single
   image with an approved caption at a low-traffic hour. Verify in the app.
   Confirm `content_publishing_limit` decremented. Keep or delete — but decide
   deliberately.
2. **Facebook Page, one post.** Same shape. `published=true`, one post,
   verified, deletable.
3. **Instagram Reel** — only after the image path is proven, because the video
   path adds the container-poll timing and the codec constraints on top of
   everything the image path already tested.
4. **Ads.** Set `META_ENABLE_ADS=true`. Create **one** campaign, PAUSED, with
   `daily_budget` at the floor Meta permits and `META_ADS_MAX_DAILY_BUDGET` set
   below anything you would regret. Inspect it in Ads Manager. **Activating it
   is a separate, manual `POST /{campaign-id}` with `status=ACTIVE` — never
   part of the creation call**, so no code path can accidentally start spending.

**Rollback for every step:** `DELETE /{object-id}`, and set the kill switch back
to `false`. Both must be tested before step 1, not discovered during step 4.

---

## 11. Operational safety

- **Idempotency.** Every publish carries a caller-supplied `client_request_id`
  recorded in the audit table (§12) before the Meta call. A retry after a
  timeout must not double-post. The repo already reasoned this through for
  `consume_credits` (`p_client_request_id`) — same idea, same reason.
- **Token-death detection.** Graph code `190` means the token is dead. Because
  the token never expires, its death is always an *event* (secret regenerated,
  assets unassigned). Log it distinctly and alert, rather than retrying.
- **Rate limits.** Codes `4`/`17`/`32`/`613` and the `X-Business-Use-Case-Usage`
  header. Back off; never hot-loop against Meta.
- **Never log a token, an `appsecret_proof`, or a raw Meta error body.** Log
  status, error code, subcode, and `fbtrace_id` — enough to open a support case,
  nothing that is itself a credential. `zoomErrorMessage()` is the precedent.
- **Asset hosting.** Higgsfield URLs may be signed/short-lived; Meta fetches
  `image_url`/`video_url` from its own servers. Stage assets in a public
  Supabase Storage bucket first. Treat this as a required pipeline step.

---

## 12. Database — PREPARED only, needs your explicit approval (CLAUDE.md §3)

Two tables, written as migration **files** and left unapplied:

- `marketing_posts` — `id`, `platform`, `client_request_id` (unique),
  `meta_object_id`, `status`, `caption`, `asset_url`, `higgsfield_job_id`,
  `published_at`, `error_code`, `created_by`
- `marketing_campaigns` — `id`, `meta_campaign_id`, `objective`, `status`,
  `daily_budget`, `created_by`, `activated_at`, `activated_by`

RLS: **owner-only, no student-readable path.** No foreign key to any academic
table, in either direction — asserted by `meta-isolation.test.mjs` check 2.
Nothing Meta returns is stored raw; everything goes through
`meta-redact.core.ts`.

Neither file should be applied until you approve each one individually.

---

## 13. Recommended sequence

| Step | Work | Gate |
|---|---|---|
| 0 | Assign IG account + Ad Account to the System User; start business verification and App Review | **your action, not code — and the long pole** |
| 1 | ~~`meta-graph.core.ts` + `meta-connection-check.mjs` + tests~~ **DONE — §15** | L0 green *(awaiting first real run)* |
| 2 | `meta-publish.core.ts` + `meta-redact.core.ts` + isolation suite | L1 green (IG container + FB unpublished) |
| 3 | `marketing-actions/index.ts` + deploy script + `DEPLOY.md` §4.2 | deployed, L0 green through the function |
| 4 | First controlled publish | L2 step 1–2, your approval per post |
| 5 | `meta-ads.core.ts` + migrations | L1 `validate_only` green, then L2 step 4 |
| 6 | Higgsfield → Storage → Meta asset pipeline | end-to-end with a real creative |

Step 0 gates 2, 4 and 5. Step 1 can begin immediately and will tell you exactly
how much of step 0 remains.

---

## 14. Open questions

1. **Ad account** — does one exist and is it assigned? L0 check 8 answers this.
2. **Instagram** — is the Si Math IG a Professional account, and is it linked to
   the Page? L0 check 5 answers this.
3. **Two tokens or one?** I recommend two (§7). Costs one env var.
4. **Ad budget ceiling** — what value for `META_ADS_MAX_DAILY_BUDGET`? It should
   be a number you would not regret at 3 a.m.
5. **Approval model** — must every post be approved by you before publishing, or
   only ads? This changes whether `marketing-actions` needs a review queue or
   just a kill switch. My assumption below is: **ads always; posts via kill
   switch initially, tightening later.**
6. **Where does Higgsfield output land?** The Storage staging bucket in §11 is
   my recommendation, not a decision you have made.

---

## Sources checked 2026-08-21

Graph API version timeline and the June 2026 metric retirement:
<https://ppc.land/meta-blocks-47-commerce-endpoints-as-graph-api-v26-0-lands-today/>,
<https://www.kitchn.io/blog/meta-marketing-api-q2-2026-update>.
Instagram container-then-publish flow, the 50-posts/24 h cap and Reels
constraints: <https://postproxy.dev/blog/post-to-instagram-via-api/>,
<https://postproxy.dev/blog/instagram-reels-api-publishing-guide/>,
<https://www.netrows.com/blog/instagram-graph-api-guide-2026>.
System User token longevity and `appsecret_proof`:
<https://singhamandeep.com/meta-system-user-access-tokens/>,
<https://stape.io/blog/api-calls-from-the-server-require-appsecret-proof-argument>.

`developers.facebook.com` is egress-blocked from this environment, so these are
secondary sources. **Confirm every endpoint path, permission name and metric
name against Meta's own reference before writing the call.**


---

## 15. L0 — what shipped (2026-08-21)

### Files

| File | Role |
|---|---|
| `supabase/functions/_shared/meta-graph.core.ts` | The adapter. The only module that knows Meta's HTTP shape. Env reader, `appSecretProof`, `redactUrl`/`redactSecrets`, error mapping, and a client whose `post()`/`del()` throw. |
| `supabase/functions/_shared/meta-connection.core.ts` | The L0 checks. Pure — no env, no I/O, no database — so the suite executes these exact bytes. |
| `scripts/meta-connection-check.mjs` | Operator CLI. Reads the environment, renders the report, sets the exit code. `--json`, `--verbose`. |
| `scripts/validate-meta-source.mjs` | Repo-wide CI gate. Auto-discovered by `tests/run-all.mjs`. |
| `tests/meta-graph.test.mjs` | 65 checks — adapter behaviour. |
| `tests/meta-isolation.test.mjs` | 138 checks — the four boundaries. |
| `tests/run-all.mjs` | One line: the two suites added to `NEEDS_TS`. |

Run it:

```bash
export META_APP_ID=... META_APP_SECRET=... META_SYSTEM_USER_TOKEN=...
export META_GRAPH_VERSION=v26.0 META_PAGE_ID=... META_SYSTEM_USER_ID=61593218806694
export META_AD_ACCOUNT_ID=act_... META_IG_USER_ID=... META_BUSINESS_ID=...

node scripts/meta-connection-check.mjs            # human report
node scripts/meta-connection-check.mjs --json     # machine-readable
```

Exit codes: `0` all checks passed · `1` at least one FAIL · `2` could not run.

### How read-only is enforced

Three overlapping mechanisms, so a write would have to survive all three:

1. The client is constructed `{ readOnly: true }`; `post()` and `del()` throw
   `ReadOnlyViolation` **before reaching fetch** (asserted: zero network calls).
2. The check module calls only `client.get()` and `client.debugToken()`.
3. `meta-isolation.test.mjs` records every request the real module makes and
   fails if any method is not `GET`; `validate-meta-source.mjs` greps the
   shipped bytes for write-shaped endpoints, with comments stripped first so
   the prose that documents the property does not satisfy the check.

The suites were mutation-tested: leaking the raw URL to the request hook,
making `post()` issue a real request, misclassifying an asset blocker, and
relaying Meta's raw error body were each introduced deliberately and each
turned the suites red.

### Two misdiagnoses found by running it

Both were found by executing the checker rather than by reading it, and both
were the same failure class — a network condition reported as a Meta
configuration problem, sending an operator to fix something that was not broken.

1. **A transport failure was reported as a missing asset assignment.** With no
   route to Meta, every check fell through to "not visible to this System User
   → Business Settings". Now class A, saying explicitly that nothing about the
   Meta setup can be concluded from the run.

2. **A proxy's `403` was reported as a missing permission** — and its
   recommended action was App Review, which is weeks. Every genuine Graph
   application error carries a numeric `code`; an auth failure is 190 or 200,
   never 0. A 401/403/407 with **no** Graph code did not come from Graph's
   application layer at all. Now class A and named as a likely egress filter.
   A test asserts that a Graph-*coded* 403 still lands in class B, so the fix
   did not simply move the misdiagnosis.

### What L0 does not tell you

It reads configuration. It does **not** prove a post would succeed: Meta can
accept a token, grant a scope, and still refuse a publish for reasons only a
real container reveals — most likely that `image_url` is not publicly fetchable
by Meta's servers (§5, §11). That is what L1 exists to find out, and L1 is not
built.
