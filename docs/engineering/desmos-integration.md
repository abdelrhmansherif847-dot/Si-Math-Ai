# Desmos — the official integration path

<!-- desmos-activation: UNPROVEN -->

> ## Status: **UNPROVEN**
>
> The integration is built, wired and gated. **The Desmos calculator has never
> been mounted.** Everything below about how it behaves once a key exists is
> written from the documented API, not from having run it.
>
> The marker above is machine-read by `scripts/validate-desmos-activation.mjs`,
> which fails CI if any exam names a calculator provider while it still says
> UNPROVEN. Flipping it to ACTIVATED requires an evidence line the same check
> validates, field by field. **Do not flip it by hand because the code looks
> right.**

**Written 2026-08-27.** Supersedes the licensing conclusion in
`docs/roadmap/mock-exam-v2-investigation.md` §7.1, which was wrong. Nothing here
is inferred from the public website terms; every claim is quoted from the
primary source and the source is named.

---

## 0. The correction, first

The repository has said, in two places, that a Desmos integration is blocked
until a signed partnership agreement exists, and that **"there is no free or
self-serve route for a commercial exam-prep product"**
(`mock-exam-v2-investigation.md` §7.1, repeated in `exam-calculator.js`'s
header).

**That is false.** It came from reading the wrong document. §7.1 quotes the
**desmos.com website Terms of Service**, which govern the *public website* — and
those really do prohibit framing and mirroring it. Embedding a calculator is
governed by a different document that §7.1 never opened:

> **Desmos API Terms of Service**, Version 1.0, Updated: July 11, 2025
> `https://github.com/desmosinc/policies/blob/main/api-terms.md`
> (also served at `https://www.desmos.com/api-terms`)

Its §3.a offers precisely the route §7.1 says does not exist. The gate is a paid
API key, not a signature.

---

## 1. The compliant integration path

**Load the official API script from Desmos's own origin, with our own API key,
and mount the calculator into an element we provide.** That is the licensed
model, and it is what the terms are written to describe.

The grant, verbatim:

> **§5.a Grant of Rights.** "Subject to the Usage Limits for the Trial Tier and
> to payment of Fees for the Commercial Tier, Desmos Studio grants you a
> non-exclusive, revocable, non-transferable, non-sublicensable (except for use
> by your End Users of the Applications), limited license to: (i) access and use
> the Software Service solely for the purpose of incorporating Content into the
> Applications; and (ii) use, reproduce, distribute and publicly display Content
> on or through the Applications, in each case, in accordance with the
> Documentation."

> **§4.a** "The Software Service enables you to render and embed calculators,
> graphs and other content (collectively, the "**Content**") within your
> application(s) ("**Applications**")…"

Concretely, and as implemented in `exam-graph-desmos.js`:

```
https://www.desmos.com/api/v1.11/calculator.js?apiKey=<our key>
→ Desmos.GraphingCalculator(element, options)
→ instance.destroy()   on unmount
```

Nothing is copied, bundled, mirrored or reconstructed. The script is theirs and
comes from their host; the key identifies our Application; the calculator's own
interface is what renders.

### What the terms forbid, and how the build honours each

| Clause | What it forbids | What we do |
|---|---|---|
| Website ToS | Framing or mirroring **desmos.com** | We never iframe desmos.com. We load the API script and mount an instance. |
| **§5.b(iii)** | *"remove, alter, or obscure any branding (including copyright and trademark notices) of Desmos Studio or its suppliers on the Software Service or Content"* | Zero appears in **our** chrome — the launcher button and the workspace header above the rule. Nothing of ours is drawn over the calculator's region. This is verified, not asserted: see §4. |
| **§6.b** | Using the Marks *"in marketing or promotional materials without our express prior written consent"* | The name appears **inside the product**, to identify the tool, which §6.b licenses. It appears in no marketing copy, no landing page, no meta tag. |
| **§6.b** | *"nor will you adopt any derivative or confusingly similar names, brands or marks or create any combination marks with the Marks"* | No "Zero × Desmos", no lockup, no co-branding. Our tool is called **Graphing Calculator**; the provider is named beneath it when one is licensed. |
| **§5.b(i)** | Sublicensing or redistributing the Software Service | Students use it as End Users of our Application, which §5.a expressly permits. |
| **§5.d** | Not deploying Updates within 60 days | The API version is a single constant, `API_VERSION`, in one file. |

**No clause in the API Terms restricts assessment, testing or exam use.** I
looked for one specifically. There is none. §5.b's Application restrictions are
about legality, malware and offensive content — not about what subject the
Application teaches or whether it is timed.

---

## 2. What we need before production activation

Two things, and only two.

### 2.1 An API key

Requested at `desmos.com/my-api`. Requesting one is itself acceptance of the
terms:

> "By (i) using the Desmos API in the absence of an active written agreement
> with us or (ii) by requesting an API Key from us, you are agreeing that these
> API Terms of Service … govern your access and use of the Software Service."

The key must be treated as a secret:

> **§5.c** "Your API Key is intended to be used by you and to identify your
> Application. You will keep your API Key confidential and make reasonable
> efforts to prevent and discourage others from using your API Key."

**This repository is public.** A key committed here is a key published,
whatever §5.c says. It is therefore read from `globalThis.SI_DESMOS_CONFIG`,
injected at deploy time, and never written into a source file. The provider has
no default key and no fallback key.

### 2.2 A tier that matches how we use it

This is the part that is easy to get wrong, so the code refuses to guess.

> **§2.a Trial Tier Usage Limits.** "Your use must be solely for (a) personal,
> non-commercial use or (b) a 90 day trial for internal testing to evaluate in
> preparation for commercial use. **Commercial use includes any use of the API
> in an Application that is accessed by End Users in production**, or any
> internal use of the API for a business purpose."

Si Math AI sells subscriptions in EGP and serves real students. Putting a
calculator in a student's exam **is** commercial use, by that sentence, from the
first student. The 90-day trial covers us evaluating it internally — building
the integration, checking fidelity, deciding whether it belongs — and stops
exactly at the point a student sees it.

> **§3.a Notification of Commercial Tier Use.** "Prior to any use of the
> Software Services outside of the Trial Tier Usage Limits, including as part of
> any commercial Application, you agree to: (a) upgrade to an appropriate paid
> plan via our self-service pathway or (b) contact us via email to
> partnerships@desmos.com and enter into a written Commercial Addendum to these
> Terms."

So: **(a) self-service paid plan** *or* **(b) written Commercial Addendum**. The
self-service pathway is a real, stated option for a commercial application. A
signed agreement is the alternative for anything the self-service plans do not
cover.

Alongside the Fees, a Commercial Tier subscription carries obligations worth
knowing before signing up rather than after — §3.b (non-refundable, payable in
advance), §3.g (reporting whatever the Fee calculation needs), and §3.h (keeping
a tracking system for a year afterwards, auditable once every 12 months).

### 2.3 What is NOT decided here, and cannot be

**The fee schedule.** `www.desmos.com` is blocked by this environment's egress
proxy, so the pricing page and the self-service plan tiers could not be read.
§3.a says the pathway "will describe (i) the fees" — what those fees are is a
number I have not seen and will not guess. Reading it is a five-minute task on
an unrestricted network and it is the only open input to the business decision.

---

## 3. How the provider abstraction is wired

The socket already existed. `exam-calculator.js` was built in Mock Exam v2 Phase 4
with a deliberately empty provider registry, for exactly this. **No new layer was
invented; two providers were registered into the one that was waiting.**

```
exam-calculator.js          the socket — registerProvider / getProvider / describe
  ├── exam-graph-desmos.js  the official Desmos provider   (gated on a key)
  └── exam-graph-zero.js    Zero Graph, first-party        (always available)
```

Every provider satisfies one contract, which the socket enforces on registration:

```js
{ id, displayName, status() → {ready, state, detail}, mount(el, opts) → Promise, unmount() }
```

**Three separate gates, and they are not the same gate.**

1. **Registration** — does the module exist? Both do. Unconditional.
2. **Readiness** — `status().ready`. For Desmos this is decided entirely by
   configuration, and there are four ways to be not-ready:

   | `SI_DESMOS_CONFIG` | state | ready |
   |---|---|---|
   | absent | `no-key` | no |
   | `{apiKey}` | `no-tier` | no |
   | `{apiKey, tier:'trial', studentFacing:true}` | `trial-misuse` | no |
   | `{apiKey, tier:'trial'}` | `trial` | **yes** |
   | `{apiKey, tier:'commercial', studentFacing:true}` | `commercial` | **yes** |

   The third row is the one that matters. Serving the 90-day evaluation trial to
   paying students is outside §2.a, and the check lives in code rather than in a
   policy document because **a policy document cannot refuse to mount.**

3. **Availability to a student** — `isInAppAvailable(examCode)`, which needs the
   exam's *own* policy to name the provider. Every exam in `exam-registry.js` has
   `provider: null`. **So even with both providers registered and Zero Graph
   permanently ready, no student is offered a calculator today.** Registering a
   provider changes nothing a student sees; naming it in an exam's policy is a
   separate, deliberate decision per exam, which is right, because DSAT, ACT
   online, ACT paper and EST I have four different test-day realities.

Activation, therefore, is: obtain a key → declare the tier → name the provider in
the exams where a calculator is faithful. Three acts, none of which is a code
change to the exam UI.

### Why Zero Graph is not the decision

`exam-graph-zero.js` wraps our own expression plotter on the identical contract,
so the exam surface cannot tell the two apart — verified in §4. It exists so the
UI can be finished and reviewed now, and so there is something to show if Desmos
is ever unreachable mid-exam. **It is not a replacement for evaluating the
official path, and the architecture is built so that choosing Desmos later is a
configuration change, not a redesign.**

### Why the calculator is in-panel and not a new tab

`exam-integrity.js` records `visibility_hidden` and `window_blur` — the exam tab
being hidden or losing focus — as integrity events, with durations. Sending a
student to desmos.com in a second tab would fire an integrity event *by design*,
on every legitimate use of a permitted tool. The in-panel mount is the only model
compatible with the integrity layer that already ships.

---

## 4. The preview, and what it proves

`exam-ui-preview.html` (built by the scratchpad's `build-exam-ui.py` from the
shipped modules — nothing is re-implemented for the preview) shows the flow the
brief asked for: **Question → Graphing Calculator → use it → return to the same
question.** The question stays mounted behind the panel; Escape or Close returns
to it; no navigation happens.

It carries a **preview-only** provider switcher — Desmos gated, Desmos
configured, Zero Graph — so all three states can be seen side by side. That
switcher is a review instrument and is not part of the student build. The
"Desmos, configured" state sets a placeholder key that is not a real key; it
renders the region the calculator would occupy, and says so.

74 checks pass in light and dark (`vui.cjs`). The ones that carry this document's
claims:

- **the panel does not move or resize with the provider** — panel, header and
  mount rectangles compared across all three states, identical to the pixel.
- **our chrome is byte-identical across all three providers** — the header's
  markup is diffed between states, minus the one subtitle line meant to differ.
- **Zero is in OUR header in every state / and never inside the provider's own
  region** — counted in both subtrees. This is §5.b(iii), enforced by a test.
- **the gate is decided by credentials, not a flag** — all five config rows above
  driven and asserted.
- **registering a provider still offers NO student a calculator** —
  `isInAppAvailable` across three real exam codes.
- **nothing claims a partnership, sponsorship or co-branding** — the rendered
  text and every `alt`/`aria-label`/`title` swept for it.

Two of these were red before they were green. The header used to grow when a
ready provider's longer subtitle wrapped, which moved the calculator region
19px — the chrome changing shape because of which provider was active, which is
the exact failure the abstraction exists to prevent. And the mount region was
auto-height, which would have mounted a Desmos calculator into a container with
no height. Both are fixed.

**What the preview does not prove: the Desmos calculator has never rendered
here.** `www.desmos.com` is blocked by this environment's egress proxy and no key
exists. The mount path is written against the documented API and is unexercised.
First activation must be verified by a human with a key on an unrestricted
network, and should be treated as unproven until then.

---

## 5. The blocker, stated precisely

There is **no legal blocker to building the integration**, and none to shipping
it once paid.

The single blocker to production activation is:

> **A Commercial Tier API key.** Required because Si Math AI is commercial and
> students are End Users in production — API Terms §2.a: *"Commercial use
> includes any use of the API in an Application that is accessed by End Users in
> production."* Obtained by either route in §3.a: *"(a) upgrade to an
> appropriate paid plan via our self-service pathway or (b) contact us via email
> to partnerships@desmos.com and enter into a written Commercial Addendum to
> these Terms."*
>
> Source: Desmos API Terms of Service, Version 1.0, Updated July 11, 2025 —
> `github.com/desmosinc/policies/blob/main/api-terms.md`.

It is a purchase, not a negotiation, unless the self-service plans turn out not
to cover our shape of use. **The one fact still missing is the price**, because
desmos.com is unreachable from here.

Internal evaluation may begin **now**, without paying, under §2.a's 90-day
trial — provided it is genuinely internal. The moment a student sees it, §3.a
applies. `exam-graph-desmos.js` refuses to mount in that combination rather than
leaving it to memory.

---

## 6. The activation runbook

Everything below is prepared. None of it has been run. Work top to bottom; each
step's failure mode is named, because the first three all *look* like "the key is
wrong".

### Step 0 — get the price, then the key

The fee is **not published**. It is not on a pricing page, not in the API Terms,
and not in any third-party listing — Capterra, G2, GetApp and SoftwareAdvice all
carry Desmos's free consumer product and no API figures. §3.a says the
self-service pathway "will describe (i) the fees", so the number exists behind
sign-in, not in public.

- Sign in at **`desmos.com/my-api`** and read the plans on the self-service
  pathway. That is where the figure is.
- If no self-service plan fits assessment use at our volume,
  **partnerships@desmos.com** and a Commercial Addendum is the §3.a alternative.
- Ask two things while you are there. Neither is answerable from the terms and
  both change the deployment:
  1. **Can the key be restricted to a domain?** A browser key is visible in the
     page source by construction — see step 2 — so domain restriction is the
     only thing that makes §5.c's "reasonable efforts" mean anything concrete.
  2. **Which products does the plan enable?** Graphing, scientific, four-function,
     geometry and 3D are per-key (§4.b). The activation test records whatever
     comes back in `Desmos.enabledFeatures`.

Read the **current API version** off `desmos.com/api` while you are signed in.
This repository defaults to `v1.11`; search results dated 2026-08-27 title that
page "Desmos API v1.12 documentation", which could not be confirmed from the
environment this was written in. §5.d gives 60 days to take an Update.

### Step 1 — open our own CSP to Desmos — **done**

**This was the blocker nobody would have found until the first live attempt, and
it was ours, not Desmos's.** `vercel.json` shipped a strict Content-Security-Policy
that listed `https://www.desmos.com` in no directive at all. The API script would
have been refused by the browser before a line of Desmos code ran — and the
symptom, a script that silently never loads, is indistinguishable from a bad key.

`https://www.desmos.com` is now allowed in five directives: `script-src`,
`style-src`, `font-src`, `img-src`, `connect-src`. That is wider than the
"add only what the test reports" rule this document used to state, and the
reason is deliberate: the alternative was a first live activation in front of
students with a calculator missing its fonts or images, and a single named
origin across five directives is a bounded widening, not a hole.

**Narrow it afterwards.** The activation test reports every
`securitypolicyviolation` it sees; once it has run green, drop the directives
the calculator never used.

**One CSP outcome would be a decision, not a fix.** If the test reports a
`script-src` violation with a blocked URI of `eval`, the Desmos bundle needs
`'unsafe-eval'` — which `scripts/verify-security-headers.sh` fails the build for,
by design, because this codebase contains no `eval()`. Granting it would trade a
standing security guarantee for the calculator. Do not do that silently.

`frame-src 'none'` is untouched. That is what structurally prevents anyone
iframing desmos.com, which the website terms forbid.

### Step 2 — configure the key, without putting it in this repository

**Decided and built.** The three options this section used to list are resolved:
the key is a **Vercel environment variable**, read at request time by a
**zero-config serverless function** at `api/desmos-config.js`, which hands the
page the object `exam-graph-desmos.js` already expects.

| | |
|---|---|
| **Variable name** | `SI_DESMOS_CONFIG` |
| **Value** | the configuration object, as compact JSON |
| **Environments** | Production (and Preview, if you want it live on branch deploys) |

```json
{"apiKey":"<the key>","tier":"commercial","studentFacing":true}
```

`apiVersion` is optional — add `,"apiVersion":"v1.12"` only once you have read
the current version off `desmos.com/api`. Omitted, the provider uses its own
default.

**The contract is not reshaped.** The environment variable *is* the
configuration object. The endpoint parses it, checks it, and assigns it; it does
not rename fields, invent a second spelling, or supply defaults the provider
already supplies. A translation layer between the variable and the contract is a
place for the two to drift apart silently, which is why there isn't one.

Why a function rather than a build step: this site is live. Adding a
`buildCommand` to a project that is `framework: null` with no build command
today changes how **every** file is deployed, and a mistake there breaks the
whole site rather than the calculator. Vercel serves `/api` functions with zero
configuration for static projects, so nothing about the existing deployment
changes. `script-src 'self'` already covers it — the endpoint is same-origin.

What the endpoint refuses, each returning an inert config rather than a broken
calculator: absent variable, unparseable JSON, a non-object, a missing or empty
`apiKey`, a `tier` that is neither `commercial` nor `trial`, and — mirroring the
client's own refusal — a `trial` key marked `studentFacing` (§2.a). Unknown
fields are dropped and named in the log, because a typo'd field is otherwise
silently ignored and the symptom is a calculator that will not start for no
visible reason.

**It never logs the key**, and `scripts/validate-desmos-activation.mjs` fails CI
if a future edit passes any config value to `console`. Vercel keeps function
logs; a key logged there is a durable, searchable credential — worse than the
browser exposure, because the browser exposure is at least inherent and known.

**Be honest about what "confidential" can mean here.** The endpoint is public,
and the key it returns is visible to anyone who requests it. So is the key in the
`calculator.js?apiKey=…` URL in any student's network tab. That is what a browser
integration is, not a flaw in this design. §5.c's "reasonable efforts" are
therefore: never in git (enforced), never in logs (enforced), and
**domain-restricted at Desmos if they support it** — which is the control that
actually binds, and the open question from step 0.

### Step 3 — run the activation test

```
DESMOS_API_KEY=<key> DESMOS_TIER=commercial \
  node scripts/check-desmos-activation.cjs
```

**Two modes, and only one of them is the milestone.**

**Deployed mode — this is the activation milestone.** It drives the live page the
way a student does: loads the exam, clicks the real launcher, and watches what
happens. The key comes from the deployed endpoint and **this process never
handles it** — the only assertion made about the key is that one came back, never
its value, its length, or any part of it.

```
DESMOS_ACTIVATION_URL=https://www.si-math-ai.com/mock-exam.html \
  node scripts/check-desmos-activation.cjs
```

Fourteen checks: the page loads, `/api/desmos-config` answered 200, it returned a
key, the tier is `commercial`, the exam offers a calculator control, the
workspace opens over the question, the provider is not gated, nothing was
CSP-blocked, the Desmos API loaded, the graphing calculator is enabled on this
key, the region has real size, **the calculator itself** is what is in it (our
own error card does not count), our chrome does not overlap it (§5.b(iii)), the
tool is named for its job rather than the vendor, nothing claims a partnership,
every Desmos request returned under 400, and the page threw nothing.

**Local mode — an isolation tool, not the milestone.** Mounts the provider on a
synthetic page under the CSP read from `vercel.json`. Useful for separating "the
key is wrong" from "the page is wrong" before deploying. It deliberately does
**not** print the lines that mark the record ACTIVATED, because it exercised no
student flow.

```
DESMOS_API_KEY=<key> DESMOS_TIER=commercial \
  node scripts/check-desmos-activation.cjs
```

Run either from a network that can reach `www.desmos.com`.

It writes `scripts/desmos-activation.png` — gitignored, because it is a
screenshot of a licensed third-party product.

The key never touches disk: the page is served from memory, and the key is
redacted from the output.

### Step 4 — record it, then let a student near it

Only after step 3 is fully green. The test prints the two lines to paste into
this file's header:

```
<!-- desmos-activation: ACTIVATED -->
<!-- desmos-evidence: date=…; apiVersion=…; tier=…; checkedBy=… -->
```

`scripts/validate-desmos-activation.mjs` reads them in CI and **format-checks
every field** — a template pasted without filling in fails exactly as hard as a
missing line. Until the first says ACTIVATED, the same check fails the build if
any exam in `exam-registry.js` names a calculator provider. That is the third
gate from §3 made mechanical: no student sees the calculator on the strength of
the code looking right.

Then, and only then, set `provider: 'desmos'` on the exams where an on-screen
calculator is faithful to test day. Per §7.3 of the investigation record that is
**DSAT** and **ACT online** without qualification; ACT paper and EST I are
partial and need the section model the Question Spine will bring.

---

## 7. What happens when it fails mid-exam

A student in a timed exam who opens the calculator and gets nothing is a support
incident and a fairness problem. Three things are built for it.

**A timeout.** The provider gives the script 12 seconds. A hung request is worse
than a failure, because a failure can at least say something.

**A card, not a spinner.** `exam-workspace.js` says what went wrong in the
student's language — *"The calculator did not open"* — on a neutral surface with
a single red edge rule. Not a red wash: that is the wrong volume for someone with
a clock running.

**A fallback that is offered and never taken.** Zero Graph appears as a button
reading *"Use Zero Graph instead"*, under a line saying plainly that it is **not
the same calculator**. It never switches by itself. A student who reached for a
graphing calculator and was quietly handed a different one with different
capabilities has been misled at the worst possible moment — and the exam's own
record would say they used a tool they did not choose.

`scripts/check-exam-ui.cjs` asserts all three: that the offer appears, that the
active provider is *still* the failed one until a click, and that one click does
switch it.

---

## 8. What is still open

| | |
|---|---|
| **The fee** | Not published anywhere. Read it at `desmos.com/my-api`. Step 0. |
| **Domain-restricted keys** | Unknown whether Desmos supports them. Ask at step 0; it decides how much §5.c can actually be honoured. |
| **The current API version** | Repo defaults to v1.11; v1.12 may exist. Confirm at step 0. |
| **Key injection route** | **Decided and built** — `SI_DESMOS_CONFIG` as a Vercel environment variable, served by `api/desmos-config.js`. Step 2. |
| **Which CSP directives the calculator needs** | Five are open to `www.desmos.com`; the activation test reports which were used, and the rest should then be closed. If it reports a blocked `eval`, that is a decision — see step 1. |
| **The launcher in `mock-exam.html`** | **Done** — the file was unfrozen 2026-08-27 and wired. No student is offered anything: the launcher is gated on `describe().inApp`, which is false for every exam. `scripts/check-exam-calculator-wiring.cjs` drives the real page and asserts it. |
| **Zero Graph as the production fallback** | Not yet. It draws through the figure renderer, which no shipped page loads — `exam-stimulus.js` is DRAFT and speaks an older spec shape. It now reports `no-renderer` rather than claiming ready, and `mock-exam.html` passes no `fallbackId`. A fallback that cannot draw is not a fallback. |
| **Everything about how it renders** | Never seen. The mount path is documented-API-shaped and unexercised. |
