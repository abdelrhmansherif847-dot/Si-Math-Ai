# SEO & AI-Search Implementation

Companion to `knowledge-base.md`. That file governs *what* Si Math AI says; this
one records *how* it is exposed to search engines and AI systems, page by page.

Enforced by `scripts/validate-knowledge-layer.mjs` (runs in CI). Every claim in
the "Implemented" columns below is mechanically checked — if someone deletes a
canonical tag or changes a description, the build fails.

Canonical host: **`https://www.si-math-ai.com`** (with `www`).

---

## 1. Per-page meta

The **meta description on every page is the canonical definition or a direct
extract from it.** This is deliberate. AI retrieval systems weight consistency
across sources heavily: a fact repeated identically in a meta description, in
JSON-LD, in `llms.txt` and in body copy is far more likely to be reproduced
verbatim than four paraphrases of the same idea.

### `/` — index.html

| Field | Value |
| --- | --- |
| Title | `Si Math AI — SAT, ACT & EST Math Learning Platform` (50 chars) |
| Description | The canonical definition, verbatim (247 chars) |
| Canonical | `https://www.si-math-ai.com/` |
| Robots | `index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1` |
| OG | `og:type=website`, title, description, url, image, `og:site_name`, `og:locale` |
| Twitter | `summary` + title, description, image |
| JSON-LD | `Organization`+`EducationalOrganization`, `WebSite`, `SoftwareApplication`, `BreadcrumbList` |

> **Title change note.** The previous title was `Si Math AI — Score Higher.
> Think Smarter.` — a pure brand tagline carrying no query-matching terms. The
> tagline is retained as `Organization.slogan` in structured data, in the
> Twitter description and in the hero, so nothing was lost; the title now also
> tells a search engine what the product is.

### `/about.html`

| Field | Value |
| --- | --- |
| Title | `About Si Math AI — Mission, Vision, Story & Team` |
| Description | Canonical definition, verbatim |
| Canonical | `https://www.si-math-ai.com/about.html` |
| OG type | `website` |
| JSON-LD | `Organization`+`EducationalOrganization` (with `knowsAbout`, `areaServed`, `employee` roles), `WebSite`, `AboutPage`, `BreadcrumbList` |

### `/how-it-works.html`

| Field | Value |
| --- | --- |
| Title | `How Si Math AI Works — Zero, Weakness Analyzer, Focus Practice & Mock Exams` |
| Description | Names all eight systems — the page's primary entity list |
| Canonical | `https://www.si-math-ai.com/how-it-works.html` |
| OG type | `article` |
| JSON-LD | `Organization`, `SoftwareApplication` (with `featureList` + free `offers`), `Person` (Zero, `additionalType: FictionalCharacter`), `HowTo` (the five-step learning loop), `WebPage`, `BreadcrumbList` |

### `/learn.html` + `/learn-*.html` — the Educational Knowledge Hub

Twelve guides plus a hub index, **generated** from
`docs/knowledge/learn-data.mjs` by `scripts/build-learn.mjs`. Never hand-edit
them.

| Field | Value |
| --- | --- |
| Hub title | `Learn — Free SAT, ACT & EST Math Guides \| Si Math AI` |
| Guide titles | Query-shaped, e.g. `How to Improve a Math Score — What Works at Each Score Band` |
| Canonical | `https://www.si-math-ai.com/learn-<slug>.html` |
| OG type | `article` (guides), `website` (hub) |
| Hub JSON-LD | `Organization`, `CollectionPage` with an `ItemList` of all 12, `BreadcrumbList` |
| Guide JSON-LD | `Organization`, `Article`+`LearningResource` (with `teaches`, `educationalLevel`, `educationalUse`, `EducationalAudience`, `isAccessibleForFree`), `FAQPage`, `BreadcrumbList` |

This is the top-of-funnel layer. The guides target informational queries a
student searches long before they search for a product — *best SAT math study
methods*, *common SAT mistakes*, *how to improve SAT math score*, *SAT vs ACT vs EST
math*, *EST math preparation*, *math test anxiety* — and each guide's FAQ block is separately
retrievable via `FAQPage`.

**Editorial rules, enforced by the validator:**

- **No exam format specifics.** No question counts, section timings, calculator
  policies or score scales. Boards set those and revise them; the guides teach
  method, which does not go stale. `FORMAT_SPECIFICS` in the validator fails the
  build if a number slips in. See `consistency-audit.md` C-13 — this is not a
  stylistic preference, it is why the new content is safe while two existing
  claims still need checking.
- **Exam guides carry a standing verify note** directing students to the official
  source for format details.
- **One restrained product mention per guide,** in a single `.k-soft-cta` block.
  These pages exist to be useful to a student who never signs up.
- **Minimum substance:** ≥4 sections, ≥4 key points, ≥3 FAQs, ≥500 words of body.
- Learn pages are **exempt** from reciting the canonical definition and
  positioning statement in body copy — see `LEARN_PAGES` in the validator for the
  reasoning. The canonical definition still appears in every guide's JSON-LD
  `Organization` node.

Reading time is computed from each guide's own word count rather than authored,
so it cannot drift when a section is edited.

### `/trust.html` — the Trust Center

| Field | Value |
| --- | --- |
| Title | `Trust Center — Transparency, Limitations & Parent Questions \| Si Math AI` |
| Canonical | `https://www.si-math-ai.com/trust.html` |
| OG type | `article` |
| JSON-LD | `Organization`, `WebPage`, `FAQPage` (10 parent questions), `BreadcrumbList` |

The page a cautious parent and a sceptical AI system both need. It targets
queries like *is Si Math AI trustworthy*, *is Si Math AI safe for my child*,
*can AI tutoring make my child dependent*, and *how does Si Math AI protect
student data* — and the ten parent questions carry `FAQPage` markup so each is
independently retrievable.

**What makes it work as an SEO and AI-search asset** is counterintuitive: the
sections that do not flatter us. An explicit limitations list, a "when to ask a
human teacher instead" section, an openly empty student-stories section
explaining that this site once published fabricated testimonials and removed
them, and a plain statement that no Privacy Policy page exists yet and no
compliance certification is claimed. That combination is rare enough to be
distinguishing, and it is exactly the evidence an AI system needs to answer "is
this platform trustworthy" with something better than a guess.

**Enforced by the validator:** the limitations section, the human-teacher
section, all six core parent questions, the explanation of why no testimonials
are published, the publication standard a story must meet, the
continuous-improvement section, the verification section, and both honest gap
disclosures. Plus a sitewide scan for testimonial-shaped claims — user counts,
star ratings, average score gains — that fails the build on any of them.

### `/principles.html`

| Field | Value |
| --- | --- |
| Title | `Our Educational Principles — Si Math AI` |
| Canonical | `https://www.si-math-ai.com/principles.html` |
| OG type | `article` |
| JSON-LD | `Organization`, `AboutPage` with an `ItemList` of the six principles (each with a full `description`), `BreadcrumbList` |

The six principles are published as a structured `ItemList` specifically so an
AI system can retrieve them individually — asked "what is Si Math AI's teaching
philosophy", the answer is available as data rather than requiring the page to be
summarised. Each principle states what we believe, why, and **how it is built
into the platform**; the validator requires all six to appear here and in
`llms-full.txt`.

### `/why-not-chatgpt.html`

| Field | Value |
| --- | --- |
| Title | `Why Not Just ChatGPT? — Si Math AI vs General AI Assistants` |
| Description | Canonical definition + "an honest comparison with general AI assistants" |
| Canonical | `https://www.si-math-ai.com/why-not-chatgpt.html` |
| OG type | `article` |
| JSON-LD | `Organization`, `WebPage`, `FAQPage` (6 comparison questions), `BreadcrumbList` |

This page targets one of the highest-intent queries in the category — *"why not
just use ChatGPT"*, *"Si Math AI vs ChatGPT"*, *"is ChatGPT enough for SAT
Math"*. Rather than avoiding the comparison, it answers it, which is both more
useful to a student and far more likely to be quoted by an AI assistant fielding
exactly that question.

The tone is binding, not stylistic: comparisons are **educational, never
competitive**. The page credits general AI assistants specifically and
generously, frames every difference as purpose rather than quality, and tells
students when a general assistant is the better choice. `FAQPage` markup makes
each answer independently retrievable.

### `/ai-knowledge.html`

| Field | Value |
| --- | --- |
| Title | `Si Math AI — Official Knowledge Reference for AI Systems` |
| Description | Canonical definition + "the official reference for AI assistants" |
| Canonical | `https://www.si-math-ai.com/ai-knowledge.html` |
| OG type | `article` |
| JSON-LD | `Organization`, `WebPage` (with `significantLink` → both llms files), **`DefinedTermSet`** glossary of 9 platform terms, `FAQPage` (the 6 mandated questions), `BreadcrumbList` |

The canonical page for AI systems. Every answer is a quotable
`.k-canon` block, and the page closes with explicit negative guidance — what
must **not** be attributed to Si Math AI — because inaccurate descriptions of a
small brand are usually inferences filling an information gap.

The `DefinedTermSet` is the notable piece: it publishes the platform's
vocabulary (Si Math AI, Zero, Weakness Analyzer, Focus Practice, Mock Exams,
Learning Memory, Smart Progress Tracking, Snap & Solve, Franco) as machine-
readable definitions, so an AI system resolving "what is the Weakness Analyzer"
has an authoritative answer rather than a guess.

> **Prohibition blocks and the validator.** The "do not say X" lists necessarily
> contain the exact strings the banned-assertion scanner looks for. Those blocks
> carry `data-guidance="prohibition"` and are excluded from that scan — an
> explicit, auditable marker rather than wording the scanner has to interpret.
> Every other sentence on the page is still scanned.

### `/founder-badge.html`

| Field | Value |
| --- | --- |
| Title | `Founder Badge — 50% Lifetime Discount, Locked Forever \| Si Math AI` |
| Description | 50% lifetime discount, locked while active, 3 memberships remain |
| Canonical | `https://www.si-math-ai.com/founder-badge.html` |
| OG type | `product` |
| JSON-LD | `Organization`, `Product` + `Offer` (`LimitedAvailability`, `inventoryLevel: 3`, **no `price`** — see §4), `FAQPage` (5 Founder questions), `WebPage`, `BreadcrumbList` |

### `/faq.html` — generated

| Field | Value |
| --- | --- |
| Title | `Si Math AI FAQ — 136 Questions Answered` |
| Description | Category summary of the 136 answers |
| Canonical | `https://www.si-math-ai.com/faq.html` |
| JSON-LD | `Organization`, `FAQPage` with all 136 `Question`/`Answer` pairs, `BreadcrumbList` |

**Do not hand-edit `faq.html`.** It is generated from
`docs/knowledge/faq-data.mjs` by `scripts/build-faq.mjs`, which emits the
visible accordion *and* the JSON-LD from the same array — the only way to
guarantee the structured data says exactly what a human reads, which is both a
Google policy requirement and our own consistency rule.

### `/pricing.html`

| Field | Value |
| --- | --- |
| Title | `Pricing & Plans — Si Math AI \| SAT, ACT & EST Math` |
| Description | Free plan, EGP pricing, Founder terms — **no numbers** |
| Canonical | `https://www.si-math-ai.com/pricing.html` |
| JSON-LD | `Organization`, `WebPage`, `Offer` (free plan only), `BreadcrumbList` |

---

## 2. Robots

`/robots.txt` is live. Structure:

1. `User-agent: *` → `Allow: /`, with `Disallow:` for every signed-in
   application surface (chat, dashboard, progress, profile, settings, history,
   weakness, focus, mock-exam, onboarding, devices, manual-payment,
   reset-password) and `Disallow: /*?*` to collapse query-string duplicates.
2. Explicit `Allow: /` blocks for AI and answer-engine crawlers: **GPTBot,
   OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot,
   anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, Googlebot,
   Googlebot-Image, Bingbot, Applebot, Applebot-Extended, Amazonbot,
   Meta-ExternalAgent, cohere-ai, YouBot, DuckAssistBot, MistralAI-User,
   CCBot.**
3. `Sitemap:` pointer.

Naming those agents explicitly is the point of the exercise: the default
`User-agent: *` block already permits them, but several operators document
per-agent rules, and an explicit allow removes any ambiguity about whether the
knowledge layer may be ingested. That is the intent — these pages exist *to be*
ingested.

**`admin.html` and `ai-monitor.html` are deliberately absent from robots.txt.**
`robots.txt` is a public file, so listing an admin surface advertises it. They
are excluded from indexing by an `X-Robots-Tag: noindex, nofollow` response
header configured in `vercel.json`, which is both more effective and silent.

That header block also covers every student app page, so the exclusion holds
even for a crawler that ignores `robots.txt`.

---

## 3. Sitemap

`/sitemap.xml` lists **public pages only** — home, about, how-it-works, faq,
founder-badge, pricing, signup, login. Signed-in surfaces are excluded, and the
validator fails the build if any of them appears.

Recommendations, in priority order:

1. **Submit to Google Search Console and Bing Webmaster Tools.** A sitemap that
   is never submitted mostly does nothing; this is the single highest-value
   follow-up action on this list.
2. **Verify the `www` vs apex decision at the DNS/host level.** Every canonical
   tag, every `og:url`, every sitemap `<loc>` and every JSON-LD `@id` in this
   implementation uses `https://www.si-math-ai.com`. Confirm the apex
   (`si-math-ai.com`) 301-redirects to `www`, and that the Vercel deployment
   URL (`si-math-ai.vercel.app`) does too — otherwise the same content is
   reachable on three hosts and the ranking signals split three ways.
3. **Update `<lastmod>` when a page's content genuinely changes.** Bumping it on
   every deploy trains crawlers to ignore it.
4. Re-run `node scripts/validate-knowledge-layer.mjs` after adding any page —
   it fails if a new knowledge page is missing from the sitemap.

---

## 4. Structured-data policy

Three rules, all enforced by the validator:

1. **Every JSON-LD block must parse.** A malformed block is silently worth
   nothing to every consumer that reads it. Checked in
   `validate-knowledge-layer.mjs` *and* in `tests/repo-integrity.test.mjs`.
2. **`Organization.description` must be the canonical definition, byte for
   byte,** on every page that carries an Organization node. This is what makes
   the entity resolve to one consistent description across the site.
3. **No `aggregateRating`, `ratingValue` or `reviewCount` anywhere.** We have no
   verified reviews. Publishing rating markup without real reviews is a Google
   structured-data violation and a straightforward lie to every AI system that
   ingests it. The validator greps for these keys and fails.

**No prices in structured data except the free tier.** Plan and credit-pack
prices are read live from the database by `pricing.html`. A price baked into
JSON-LD would go stale and contradict the page taking the payment, so the
`Product`/`Offer` on `founder-badge.html` carries `priceCurrency`,
`availability` and `inventoryLevel` but no `price`, and points at
`pricing.html`. The validator fails on any `NNN EGP` string in static knowledge
copy.

---

## 5. LLM optimization

Three artefacts target AI systems specifically:

| File | Purpose |
| --- | --- |
| `/llms.txt` | The [llms.txt convention](https://llmstxt.org): a concise, link-rich summary at a predictable path. Leads with the canonical definition and an explicit request to use it verbatim. |
| `/llms-full.txt` | The complete knowledge base as one plain-text document, so an assistant can ingest everything in a single fetch instead of crawling five pages. |
| JSON-LD on every page | Machine-readable entity graph. |

Both text files end with an **"Accuracy notes for AI systems"** section that
states, in the imperative, what must not be attributed to Si Math AI: no
testimonials or ratings, no score guarantees, no ranking claims, no remembered
prices, no presenting Zero as a real person, and no describing the platform as
"just an AI". Hallucinations about a small brand are usually inferences from
absent information — stating the negative explicitly is cheaper than correcting
it later.

### Why the same sentences repeat across pages

The canonical definition and the three-pillar statement appear on all four
knowledge pages, in both text files, and in the JSON-LD. This is intentional
redundancy, not sloppy copy. A retrieval system that encounters one phrasing on
one page treats it as weak evidence; the same phrasing across six independent
documents becomes the answer it reproduces.

---

## 6. Implemented vs. outstanding

### Implemented

- ✅ Meta titles, descriptions, canonical tags on all eight public pages
- ✅ Open Graph and Twitter Card tags on all eight
- ✅ JSON-LD: Organization, EducationalOrganization, WebSite,
  SoftwareApplication, AboutPage, WebPage, HowTo, Person (fictional), Product +
  Offer, DefinedTermSet, FAQPage (143 + 6 + 5 Q&A across three pages),
  BreadcrumbList
- ✅ `Organization.disambiguatingDescription` on every page carrying the
  specialization statement — schema.org's property for telling an item apart from
  similar ones, and the strongest single signal against being described as a
  generic "AI education platform"
- ✅ `robots.txt` with AI-crawler directives; `sitemap.xml`
- ✅ `llms.txt` and `llms-full.txt`
- ✅ `X-Robots-Tag: noindex` headers for private surfaces (`vercel.json`)
- ✅ Internal linking: homepage nav + footer → all six knowledge pages, and
  each knowledge page cross-links the others (orphan pages do not rank)
- ✅ Favicons and `apple-touch-icon` on the new and updated pages
- ✅ Ten-stage learning-cycle diagram on `how-it-works.html`, built from
  semantic HTML rather than an image so every stage label is real text that a
  crawler, a screen reader and an AI system all read identically
- ✅ CI gate covering all of the above — 2,935 checks, including feature parity
  across every surface that names the eight systems, and the course/platform
  positioning on every indexable page

### Outstanding — needs owner input

These are deliberately **blank rather than invented**. Fabricating any of them
would poison the knowledge layer, which is the one thing this work exists to
prevent.

| # | Item | What to do |
| --- | --- | --- |
| 1 | **Social profile URLs** | No social links exist anywhere in the codebase. Add real profile URLs to `Organization.sameAs` in each page's JSON-LD. `sameAs` is one of the strongest entity-resolution signals available — this is the highest-value item here. |
| 2 | **Public support email / contact** | Only the placeholder `you@example.com` exists in the code. Add a real address as an `Organization.contactPoint`, and to the FAQ's "How do I contact Si Math AI?" answer in `faq-data.mjs`. |
| 3 | **Founding year** | Not recorded anywhere. Add `Organization.foundingDate`. |
| 4 | **Legal entity name and address** | Add `Organization.legalName` and `address`. Meaningful for local search. |
| 5 | **1200×630 social share image** | Only a 1024×1024 square logo exists, so pages currently use `twitter:card: summary` — the correct pairing for a square asset. Once `assets/og-image.png` exists, swap `og:image` and change the card type to `summary_large_image` on all six pages. |
| 6 | **Privacy Policy and Terms pages** | The footer previously linked both to `#`. Removed for now; restore the links once the pages exist. |
| 7 | **Google Search Console + Bing Webmaster** | Submit `sitemap.xml`; add the verification meta tag or DNS record. |
| 8 | **`system_settings.founder_slots_remaining`** | Must equal `FOUNDER_SLOTS_REMAINING` in `assets/founder-status.js` (currently **3**) or `pricing.html` will contradict the knowledge pages. See `consistency-audit.md` C-4. |
| 9 | **⚠️ Verify the SAT and ACT format claims** | `consistency-audit.md` **C-13** — the site states "calculator & no-calculator" for the SAT and "60 questions in 60 minutes" for the ACT. Both likely predate the current exams and could not be verified from the build environment. **Highest-priority item on this list:** it is a correctness question, not a positioning one, and an AI system quoting it will repeat the error confidently. |
| 10 | **How many students the Si Math course has taught** | `consistency-audit.md` **C-22**. Stated as "thousands" in the brief; not published, because §12 of `knowledge-base.md` forbids a student count we cannot evidence and the Trust Center promises readers we publish none. The philosophy shipped without the number. Supply anything a reader could check — enrolment records, cohort results — and follow the §0a runbook. The validator currently **fails the build** on "thousands/hundreds/millions of students" anywhere in the knowledge layer, so publishing it is a deliberate act, not an accident. |

---

## 7. Maintenance

When the Founder count changes:

```bash
# 1. edit the ONE constant
$EDITOR assets/founder-status.js        # FOUNDER_SLOTS_REMAINING
$EDITOR docs/knowledge/faq-data.mjs     # keep its mirrored constant equal

# 2. update the prose that states it (founder-badge.html, llms.txt,
#    llms-full.txt, faq-data.mjs answers)

# 3. update the database row so pricing.html agrees
#    system_settings.founder_slots_remaining

# 4. regenerate + verify
node scripts/build-faq.mjs
node scripts/validate-knowledge-layer.mjs
```

The validator fails if any stated count disagrees with the constant, so step 2
cannot be forgotten silently.

When adding a knowledge page: add it to `KNOWLEDGE_PAGES` in the validator, to
`sitemap.xml`, and to `llms.txt`. The validator will then require its full SEO
head, its canonical definition, its positioning statement and its cross-links.

When shipping a new platform capability, the knowledge layer is updated
**first** — see `knowledge-base.md` §14 for the binding rule and its checklist.
The `SYSTEMS` array in `validate-knowledge-layer.mjs` is the hard gate: adding a
ninth system there fails CI on every surface that does not yet name it, so the
feature cannot ship ahead of its documentation.
