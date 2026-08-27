# Desmos — the official integration path

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
