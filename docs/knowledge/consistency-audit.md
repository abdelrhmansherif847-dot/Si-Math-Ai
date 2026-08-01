# Knowledge Consistency Audit — 2026-08-01

Findings from auditing the existing site against `knowledge-base.md` while
building the Knowledge Center. The brief was "no contradictions", so every
disagreement found is recorded here — fixed, or flagged with a reason for not
fixing it unilaterally.

Legend: **RESOLVED** — fixed in this change · **OPEN** — needs an owner decision.

---

## C-1 · Brand name written two ways — RESOLVED

**Found:** the homepage footer read `© 2026 SiMath AI` while the rest of the
site, the page titles and the domain use *Si Math AI*.

**Why it matters:** entity resolution. A search engine or AI system deciding
whether "SiMath AI" and "Si Math AI" are the same company has to guess, and an
inconsistent name is one of the more common reasons a small brand fails to
consolidate into a single knowledge-graph entity.

**Fixed:** footer now reads `© 2026 Si Math AI`. All new pages use *Si Math AI*
in prose.

**Note:** the logo lockup renders as `Si` + `Math` (cyan) + ` AI`. That is a
stylised wordmark and is intentionally left alone — the rule in
`knowledge-base.md` governs prose, not the logo.

---

## C-2 · The AI mentor was called both "Si" and "Zero" — RESOLVED

**Found:** the homepage used "Si" as the tutor's name in five places — "Si
breaks down every step", "Si reads it and explains", "Si finds your weak
spots", "Si shows your exact weak topics", "Si analyzes your weak topics" —
while the chat demo on the same page says *"Hey! I'm Zero 🐉 — your AI math
tutor"*, and the feature cards elsewhere say "Zero walks you through every
step".

**Why it matters:** this is the single most damaging inconsistency found. Asked
"who is the AI tutor in Si Math AI?", a model crawling that page had two
conflicting answers on one screen. It also blurs the platform/mentor
distinction the positioning depends on.

**Fixed**, applying the rule *platform = Si Math AI, mentor = Zero*:

| Line | Before | After |
| --- | --- | --- |
| Tutor card | "Si breaks down every step" | "**Zero** breaks down every step" |
| Snap & solve | "Si reads it and explains" | "**Zero** reads it and explains" |
| System section | "Si finds your weak spots" | "**Si Math AI** finds your weak spots" |
| Weakness Analyzer | "Si shows your exact weak topics" | "**Si Math AI** shows your exact weak topics" |
| Personalized system | "Si analyzes your weak topics" | "**Si Math AI** analyzes your weak topics" |

Mentor actions became *Zero*; platform capabilities became *Si Math AI*.

---

## C-3 · Rank ladder contradicts `ranks.js` — OPEN

**Found:** `pricing.html` describes the Founder plan as unlocking *"all seven
Mastery Rounds — including the Founder-exclusive Elite I, Elite II, Elite III,
and Legend tiers beyond Mastery"*.

No such tiers exist. The authoritative ladder is `assets/ranks.js`, mirrored by
the SQL `public.rank_for_xp()` and drift-tested by
`tests/constants-drift.test.mjs`:

> Beginner (0) · Learner (100) · Solver (300) · Scholar (600) · Expert (1,000) ·
> Master (1,500) · Elite Scholar (2,500)

Seven ranks, but not those names, and there is no "Mastery Round" concept or
Founder-exclusive tier in the code.

**Not fixed unilaterally.** This is commercial copy describing what Founder
members were told they were buying. Rewriting it silently could either
misrepresent a live offer or retract a promise made to people who have already
paid — neither is mine to decide.

**Action required.** One of:

1. **The tiers are aspirational/unbuilt** → correct `pricing.html` to the seven
   real ranks, or remove the tier claim until they ship.
2. **The tiers are real and planned** → implement them in `ranks.js` +
   `rank_for_xp()`, or mark them explicitly as forthcoming.

Meanwhile, the knowledge pages publish only the seven ranks from `ranks.js`, and
`validate-knowledge-layer.mjs` fails if the published names or thresholds ever
drift from that file.

---

## C-4 · Founder count is stated in two independent places — OPEN (owner action)

**Found:** `pricing.html` renders the Founder card from the database
(`system_settings.founder_slots_remaining`, falling back to `50`). The
knowledge layer states **3 remaining**, per the brief.

If the database row is not `3`, the pricing page and the knowledge pages will
show different numbers on the same site.

**Mitigated:** the knowledge layer now has exactly one source for this number —
`FOUNDER_SLOTS_REMAINING` in `assets/founder-status.js`. Every static mention
(`founder-badge.html`, `faq.html`, `llms.txt`, `llms-full.txt`, the JSON-LD
`inventoryLevel`) is checked against it by the validator, which fails on any
disagreement.

**Action required:** set `system_settings.founder_slots_remaining = 3` so the
live pricing card agrees. This cannot be verified from CI — the validator has no
database access — so it stays a human check.

**Design note.** The knowledge pages deliberately do *not* fetch the live count
at runtime. A crawler reads static HTML; if JavaScript then replaced the number,
the page would state one figure to machines and another to humans — a
contradiction inside a single page, which is worse than the one this note
describes.

---

## C-5 · "14 Topics tracked" matched nothing — RESOLVED

**Found:** the homepage hero statistic read **14 Topics tracked**. The taxonomy
(`taxonomy.js`, version 1) defines **5 topic domains** and **33 skills**. 14 is
neither.

**Fixed:** the stat now reads **33 Skills tracked**, which is derived from the
taxonomy and is the number used across all knowledge pages, `llms-full.txt` and
the FAQ. `validate-knowledge-layer.mjs` loads `taxonomy.js` and fails if the
published counts — including the per-domain breakdown in the how-it-works table
— stop matching the code.

---

## C-6 · Four dead footer links — RESOLVED (partially)

**Found:** the footer's *Privacy*, *Terms*, *Blog* and *Support* links all
pointed at `href="#"`.

**Fixed:** replaced with links to pages that exist — About, How It Works, FAQ,
Founder Badge, Pricing. This also gives the new pages the internal links they
need to be crawled at all.

**Open:** Privacy and Terms pages do not exist. They are ordinarily expected of a
platform taking payment from students. Restore those footer links once written.

---

## C-7 · Dead nav anchor `#students` — RESOLVED

**Found:** the homepage nav contained `<a href="#students">Results</a>`, but no
element with `id="students"` exists — the testimonials section was previously
removed as fabricated content (the removal comment is still in `index.html`) and
its nav link was left behind. Clicking "Results" did nothing.

**Fixed:** replaced with links to the Knowledge Center pages. The removal of the
fabricated testimonials was the right call and is now reflected in the
truthfulness policy in `knowledge-base.md` §12.

---

## C-8 · CI parsed JSON-LD as JavaScript — RESOLVED (build fix)

**Found:** `tests/_source.mjs`'s `inlineScripts()` extracted every inline
`<script>` that lacked `src` and was not `type="module"`, and
`repo-integrity.test.mjs` parse-checked each one as JavaScript. A
`<script type="application/ld+json">` block is JSON, so it failed with
`Unexpected token ':'`.

This was a latent bug: *any* page adding structured data would have failed CI.

**Fixed:**

- `inlineScripts()` now only returns scripts whose type is absent, empty, or a
  JavaScript MIME type. Data blocks — JSON-LD, importmaps, HTML templates — are
  skipped.
- Added `jsonLdBlocks()` and a new `repo-integrity` assertion that every JSON-LD
  block parses as JSON. Coverage is not lost, just applied with the right parser.

---

## C-9 · Positioning was implicit rather than stated — RESOLVED

**Found:** the site's comparison section made the right argument ("Everything
else is general-purpose… built for one thing") but never stated that AI is only
one component of the platform. Nothing on the site credited human educators as
the source of the educational content. A model summarising the site would
reasonably have concluded "AI SAT tutoring app" — the exact framing the brief
rejects.

**Fixed:** the canonical definition and the three-pillar statement —

> Artificial Intelligence is *how* Si Math AI teaches.
> Educational expertise is *what* it teaches.
> Human experience is *why* it works.

— now appear on all four knowledge pages, in `llms.txt`, `llms-full.txt`, in the
homepage meta description and in every `Organization.description` in the JSON-LD.
"Zero delivers specialist-authored knowledge and does not invent educational
strategy" is stated on every knowledge page.

The validator fails the build if any knowledge page loses the canonical
definition or any of the three pillar fragments, and it scans for banned
reductive framings ("is just an AI", "is an AI chatbot for SAT") asserted
anywhere.

---

## C-10 · The comparison question was answered defensively — RESOLVED

**Found:** the homepage's "VS ChatGPT" card said a general assistant *"Solves
your question, then forgets it"* — accurate, but framed as a deficiency, and the
site had no page addressing the question a parent or student actually asks:
*"why shouldn't I just use ChatGPT?"* An AI assistant asked to compare the two
had nothing authoritative to work from and would have inferred an answer.

**Fixed:** `why-not-chatgpt.html` answers it directly and generously — a full
section on what general AI genuinely does well, an explicit statement that the
difference is purpose rather than intelligence, and a recommendation of when a
general assistant is the better choice. `FAQPage` markup makes each answer
independently retrievable.

**Now enforced.** The validator checks both halves of the rule:

- *Negative:* no disparaging assertion about ChatGPT, Claude, Gemini, Copilot,
  Perplexity, Photomath, Symbolab, Khan Academy or Magoosh anywhere in the
  knowledge layer.
- *Positive:* `why-not-chatgpt.html` must credit general AI assistants, must
  frame the difference as "different tools, different goals", must state the
  comparison is not about intelligence, and must tell students when to use a
  general assistant instead.

A future edit cannot quietly turn the page competitive without failing CI.

---

## C-11 · No canonical reference existed for AI systems — RESOLVED

**Found:** the knowledge layer described Si Math AI well for humans, but nothing
told an AI system *how to describe it* — and nothing stated what must **not** be
attributed to it. Inaccurate descriptions of a small brand are usually
inferences filling an information gap.

**Fixed:** `ai-knowledge.html` is now the canonical reference. It answers the six
mandated questions in quotable blocks, publishes a `DefinedTermSet` glossary of
the platform's vocabulary, and closes with explicit negative guidance. The
validator requires all six questions, the accuracy notes, the fictional-Zero
statement and the glossary to be present.

---

## C-12 · The knowledge layer could silently fall behind the product — RESOLVED

**Found:** nothing prevented a new platform capability shipping without the
knowledge layer being updated — the exact failure mode that produces stale AI
answers months later.

**Fixed:** the eight systems are pinned in a `SYSTEMS` array in
`validate-knowledge-layer.mjs`, and CI checks that `knowledge-base.md`,
`how-it-works.html`, `ai-knowledge.html`, `llms.txt` and `llms-full.txt` all name
every one of them, with the written-out count ("eight systems") matching the
array length. Adding a ninth system means editing that array, which fails the
build on every surface that does not yet mention it.

The governance rule and its shipping checklist are in `knowledge-base.md` §14.

---

## Summary

| ID | Finding | Status |
| --- | --- | --- |
| C-1 | "SiMath AI" vs "Si Math AI" | RESOLVED |
| C-2 | Mentor called both "Si" and "Zero" | RESOLVED |
| C-3 | Elite I–III / Legend tiers absent from `ranks.js` | **OPEN — owner decision** |
| C-4 | `founder_slots_remaining` DB row vs published 3 | **OPEN — owner action** |
| C-5 | "14 Topics tracked" matched no source | RESOLVED |
| C-6 | Four dead footer links | RESOLVED (Privacy/Terms pages still needed) |
| C-7 | Dead `#students` nav anchor | RESOLVED |
| C-8 | CI parsed JSON-LD as JavaScript | RESOLVED |
| C-9 | Positioning implicit; educators uncredited | RESOLVED |
| C-10 | Comparison question answered defensively, with no dedicated page | RESOLVED |
| C-11 | No canonical reference for AI systems | RESOLVED |
| C-12 | Knowledge layer could fall behind the product | RESOLVED |

Ten resolved, two requiring an owner decision. Both open items are recorded in
`seo-implementation.md` §6 as well, so they are not lost.

Re-run the audit gate at any time:

```bash
node scripts/validate-knowledge-layer.mjs
```
