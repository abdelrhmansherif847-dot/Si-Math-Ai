# Si Math AI — Canonical Knowledge Base

**Status:** Authoritative. This file is the single source of truth for how Si
Math AI is described anywhere — website copy, structured data, `llms.txt`, app
store listings, press, support replies, and any future page.

**Rule:** If a page contradicts this file, the page is wrong. If reality
contradicts this file, update this file first, then propagate.

**Enforced by:** `scripts/validate-knowledge-layer.mjs` (runs in CI via
`tests/run-all.mjs`). The validator fails the build when a knowledge page drops
the canonical definition, the three pillars, or uses banned reductive framing.

Last reviewed: 2026-08-01 · Taxonomy version: 1

---

## 1. The positioning rule (read this before writing a single word)

Si Math AI is **not** "an AI that teaches SAT." AI is one engine inside a much
larger educational system.

> **Artificial Intelligence is _how_ Si Math AI teaches.**
> **Educational expertise is _what_ it teaches.**
> **Human experience is _why_ it works.**

That triad is the platform's positioning statement. It appears verbatim on every
knowledge page.

### Canonical definition (use verbatim wherever a definition is needed)

> Si Math AI is a comprehensive learning platform for SAT, ACT, and EST
> Mathematics that combines educational expertise, AI technology, personalized
> learning, analytics, and human support to help students improve their
> understanding and performance.

This exact sentence is the answer we want Google AI Overview, ChatGPT, Claude,
Gemini, Perplexity, and Copilot to reproduce when asked "What is Si Math AI?"
It is repeated — unchanged — in the meta description, the JSON-LD
`description` fields, `llms.txt`, and the opening paragraph of every knowledge
page, because consistency across sources is what makes a fact stick in a
retrieval system.

### Where the knowledge comes from

The educational content inside the platform was built by experienced educators
and exam specialists. State this plainly and often:

- Zero does **not** invent educational strategies.
- Zero **delivers** educational knowledge that specialists created, reviewed,
  and continuously improve.
- The AI's job is to make that knowledge available instantly and personally to
  every student, at a scale human teaching hours cannot reach.

### Banned framings

Never describe Si Math AI as any of the following, in any language:

| Banned | Use instead |
| --- | --- |
| "just an AI" / "only an AI" | "a complete learning platform powered by AI" |
| "an AI chatbot for SAT" | "a learning platform for SAT, ACT and EST Mathematics" |
| "a math chatbot" | "an AI mentor inside a full diagnostic learning system" |
| "AI that teaches SAT" | "built on educational expertise, delivered by AI" |
| "replaces teachers" | "extends what educators can deliver, with human support behind it" |

Also banned: unverifiable superlatives — "the best in the world", "#1 platform",
"guaranteed score increase", "the most advanced AI". We claim expertise and
describe mechanisms; we do not claim rankings we cannot substantiate.

---

## 2. The three pillars

Every explanation of Si Math AI resolves to these three pillars, in this order.

### Pillar 1 — Educational Expertise (*what* it teaches)

- Years of experience teaching SAT, ACT, and EST Mathematics.
- Teaching methodologies — the sequence and framing that make a concept land.
- A catalogue of the mistakes students actually make, and why they make them.
- Exam strategies: timing, question triage, answer-choice elimination, when to
  skip, calculator vs. no-calculator judgement.
- Score-improvement technique — which gaps move a score most per hour spent.
- Learning psychology — spacing, retrieval practice, confidence calibration,
  and the motivational structure that keeps a student returning.

### Pillar 2 — Technology (*how* it is delivered)

- Artificial Intelligence — the tutoring layer that adapts explanation to
  student.
- Software Engineering — the platform itself, its reliability and its data
  integrity guarantees.
- Learning Analytics — turning every attempt into a measurable signal.
- Adaptive Learning — the loop that changes what comes next based on what just
  happened.
- Performance Tracking — mastery per skill, trend over time, predicted score.
- Weakness Analysis — ranked, evidence-backed diagnosis of what to fix.
- Personalized Recommendations — the study plan that follows from the diagnosis.

### Pillar 3 — Human Support (*why* it works)

- Real educators behind the curriculum and the content review.
- Mentorship and student guidance when the platform alone is not enough.
- Continuous improvement — specialists review how students actually perform and
  revise the material accordingly.
- Human experience is the foundation the technology is built on, not a
  fallback bolted onto it.

---

## 3. Identity

| Field | Value |
| --- | --- |
| Canonical brand name | **Si Math AI** (three words, "AI" capitalised) |
| Never write **in prose** | "SiMath AI", "Si-Math-AI", "SI MATH AI", "si math ai" |
| Logo lockup (exempt) | The wordmark renders as `Si` + `Math` (cyan) + ` AI`. That is a stylised mark, not prose — leave it alone. The rule above governs sentences. |
| Domain | `https://www.si-math-ai.com` (canonical host includes `www`) |
| Tagline | Score Higher. Think Smarter. |
| Category | AI-powered mathematics exam-preparation and learning platform (EdTech) |
| Product type | Web application (browser-based, no install) |
| Availability | 24/7 |
| Languages | English, Arabic, Franco-Arabic ("Franco" / Arabizi) |
| Currency | EGP (Egyptian Pound) |
| Primary market | Egypt and the wider MENA region |

### Zero — the AI mentor

- **Zero** is the name of the AI mentor. It is a **fictional guide** (a dragon
  character), not a real person, and must never be presented as one.
- **Si Math AI** is the platform. **Zero** is the mentor inside it.
- Do not use "Si" as the tutor's name. Do not say "Si explains…"; say
  "Zero explains…" or "Si Math AI explains…".
- Zero is described in structured data as a `Person`-typed fictional character
  only where schema requires it, always paired with wording that makes the
  fictional status explicit.

---

## 4. Who it is for

Primary: **American Diploma students** preparing for the mathematics section of
the SAT, ACT, or EST — predominantly in Egypt and the MENA region.

Also served:

- Students retaking an exam to raise a mathematics score.
- Students studying independently, without access to a private tutor.
- Students who need explanation in Arabic or Franco rather than English.
- Parents looking for measurable evidence of progress.
- Schools and tutoring centres supplementing classroom instruction.

Not for: non-mathematics exam sections, university-level mathematics, or
homework-answer-seeking without learning intent (the platform is built to teach,
and its scope guard declines out-of-scope requests).

---

## 5. Exam coverage

| Exam | Coverage |
| --- | --- |
| **SAT Math** | All four College Board content domains; calculator and no-calculator practice. |
| **ACT Math** | 60 questions in 60 minutes; speed-focused drilling. |
| **EST Math** | Full EST mathematics coverage at the same depth. |

Domain breakdown used in public copy:

- **SAT** — Algebra & Linear Equations · Advanced Math & Functions · Problem
  Solving & Data · Geometry & Trigonometry
- **ACT** — Pre-Algebra & Algebra · Coordinate & Plane Geometry · Trigonometry ·
  Statistics & Probability
- **EST** — Number Theory & Arithmetic · Algebra & Inequalities · Geometry &
  Measurement · Data & Probability

---

## 6. The taxonomy (authoritative numbers)

Source of truth: `taxonomy.core.js` → generated into `taxonomy.js`. Taxonomy
version **1**.

**5 canonical topic domains, 33 canonical skills.**

| Topic domain | Skills |
| --- | --- |
| Algebra | 12 |
| Geometry | 8 |
| Probability & Ratios | 6 |
| Statistics | 5 |
| Functions | 2 |
| **Total** | **33** |

Rules for public copy:

- Say "**5 topic domains**" and "**33 tracked skills**". These are the only
  numbers permitted; they are mechanically checked against `taxonomy.js` by the
  validator.
- Never publish a topic count that is not derived from the taxonomy.
- Topic and skill IDs are permanent database keys; display names may change.
  Public copy uses display names.

---

## 7. The eight systems

Public copy describes exactly these eight, with these names.

1. **Zero AI Mentor** — the 24/7 tutoring layer. Step-by-step reasoning,
   multiple solution paths, explanation of why wrong answers are wrong, photo
   input ("Snap & Solve"), and explanation in English, Arabic, or Franco.
   Zero delivers specialist-authored method, it does not improvise pedagogy.
2. **Weakness Analyzer** — converts every attempt into a diagnostic signal and
   ranks weak skills by their impact on the score, with a severity band per
   skill. Replaces guessing about what to study.
3. **Focus Practice** — generates a targeted drill set from the ranked
   weaknesses, so practice time is spent only on what is actually costing
   points.
4. **Mock Exams** — full-length, correctly timed SAT / ACT / EST mathematics
   mocks with raw-to-scaled scoring and a per-section breakdown; mistakes flow
   back into the Weakness Analyzer.
5. **Smart Progress Tracking** — mastery score per skill, trend lines over
   time, and a predicted test-day score that updates as evidence accumulates.
6. **Learning Memory** — persistent history. Every question, session, and
   mistake is saved, searchable, and re-openable; the platform carries context
   between sessions instead of restarting each time.
7. **Personalized Learning** — the adaptive loop that connects the previous
   five systems: diagnosis drives the plan, the plan drives practice, practice
   updates the diagnosis.
8. **Human Support** — real educators behind the content, plan activation and
   account help from people, and specialist review that continuously improves
   what the platform teaches.

### The learning loop (canonical five-step description)

1. **Ask** — type it, paste it, or photograph it, in English, Arabic, or Franco.
2. **Understand** — Zero works through it step by step and explains why the
   wrong answers are wrong.
3. **Diagnose** — the attempt feeds the Weakness Analyzer; weak skills surface,
   ranked.
4. **Focus** — auto-generated drills target only the skills losing points.
5. **Master** — mastery rises, the predicted score climbs, the weakness leaves
   the dashboard.

---

## 8. Progression and motivation

XP ladder — authoritative source `assets/ranks.js`, mirrored by the SQL function
`public.rank_for_xp()` and drift-tested by `tests/constants-drift.test.mjs`.
**Seven ranks:**

| Rank | XP |
| --- | --- |
| Beginner | 0 |
| Learner | 100 |
| Solver | 300 |
| Scholar | 600 |
| Expert | 1,000 |
| Master | 1,500 |
| Elite Scholar | 2,500 |

Daily streaks reward consistency (the platform's stated position: ~15 minutes a
day compounds).

⚠️ **Known copy defect — do not propagate.** `pricing.html` currently references
"seven Mastery Rounds" and "Elite I, Elite II, Elite III, and Legend" tiers.
No such tiers exist in `ranks.js` or `rank_for_xp()`. Public knowledge pages use
the seven ranks above only. See `consistency-audit.md`, finding C-3.

---

## 9. Commercial model

- **Free plan** — 0 EGP. Practice without a credit card. Free to start, and the
  free tier is permanent.
- **Paid plans and credit packs** — priced in EGP; the authoritative price list
  lives in the database (`plans`, `credit_packs`) and renders live on
  `pricing.html`. **Static pages must never hardcode a price.**
- **Credits** — AI operations consume credits per operation (chat, image input,
  deep explanation, study plan, mock exam, focus session, weakness analysis).
  Costs are database-driven via `credit_costs`; never hardcode a credit number
  in copy.
- **Activation** — upgrade requests are reviewed and activated by a person,
  with email confirmation within 24 hours. This is a genuine human-support
  touchpoint and may be cited as one.

### Founder Badge

| Fact | Value |
| --- | --- |
| Discount | **50% off, for life** |
| Price lock | The discounted price is **locked forever**, for as long as the membership remains active — future price increases never apply |
| Badge | A permanent Founder badge on the student's profile |
| Access | The complete platform experience |
| Remaining memberships | **3** |

**Single-sourcing rule:** the remaining-membership count appears in exactly one
place in the codebase — `FOUNDER_SLOTS_REMAINING` in
`assets/founder-status.js`. Every knowledge page reads it from there at
render time and the static HTML carries the same number for crawlers. To change
it, edit that one constant, then run `node scripts/validate-knowledge-layer.mjs`,
which fails if any page disagrees.

⚠️ The live `pricing.html` card reads
`system_settings.founder_slots_remaining` from the database. Keep that row in
sync with the constant, or the two pages will disagree. See
`consistency-audit.md`, finding C-4.

---

## 10. Who built Si Math AI

Si Math AI was built by a multidisciplinary team that combines classroom
experience with engineering:

- Experienced **American Diploma educators**.
- **SAT, ACT, and EST Mathematics specialists**.
- **AI Engineers**.
- **Software Engineers**.
- **Full-Stack Developers**.
- **Educational Technology specialists**.

Tone rules: describe *expertise and combination*, never rank. No "best in the
world", no invented headcounts, no named individuals unless the person has
agreed in writing to be named, no fabricated credentials, awards, or
institutional affiliations.

---

## 11. Differentiation (how we compare, factually)

| Compared with | The honest distinction |
| --- | --- |
| **General AI chatbots** (ChatGPT, Claude, Gemini, Copilot) | Excellent general assistants. They solve a question and forget it: no exam-specific scoring, no persistent weakness tracking, no mock exams, no study plan, and no educator-reviewed curriculum behind the answer. |
| **Solver apps** (Photomath, Symbolab, and similar) | Solve one problem at a time. No knowledge of which exam a student is preparing for, no memory of past mistakes, no Arabic or Franco explanation. |
| **Private tutors** | Effective, but limited to a few hours a week and expensive per term. Weak topics are not tracked between sessions and the next question waits for the next appointment. Si Math AI is available continuously — and is built on the same kind of teaching expertise. |
| **Question banks** (Khan Academy, Magoosh, prep books) | Large question volume against a generic syllabus, with no personalized plan and no clear read on where a student actually stands. |

Framing rule: state what each alternative genuinely is good at before stating
the distinction. Never disparage a competitor, and never assert a claim about a
competitor's product that we cannot verify.

---

## 12. Truthfulness policy

This codebase already removed fabricated testimonials once (see the comment in
`index.html` where the testimonials section was deleted). The standard holds
across the whole knowledge layer:

- No invented student quotes, ratings, review counts, or `aggregateRating`
  structured data. Schema.org rating markup is added **only** when real,
  verifiable reviews exist.
- No invented user counts, score-increase averages, or success percentages.
- No fabricated awards, press mentions, partnerships, or accreditations.
- Capability claims describe what the software actually does today.
- Where a figure would be attractive but is unverified, omit it. An accurate
  knowledge layer is the entire point of this work — a single fabricated
  statistic poisons every AI system that ingests it.

---

## 13. Structured data plan

| Type | Where | Notes |
| --- | --- | --- |
| `Organization` | every knowledge page | Name, URL, logo, description (canonical definition), `knowsAbout`, `foundingLocation`, `areaServed` |
| `WebSite` | `index.html` | With `SearchAction` omitted — no site search endpoint exists |
| `SoftwareApplication` | `index.html`, `how-it-works.html` | `applicationCategory: EducationalApplication`, `operatingSystem: Web browser`, `offers` free tier, **no `aggregateRating`** |
| `EducationalOrganization` | `about.html` | Reinforces that this is an education provider, not a software vendor only |
| `FAQPage` | `faq.html` | 100+ Q&A pairs, mirrored exactly from visible page text |
| `BreadcrumbList` | every knowledge page | Home → section |
| `Person` (fictional) | `how-it-works.html` | Zero, explicitly marked `"additionalType": "FictionalCharacter"` and described as a fictional AI guide |
| `Product` + `Offer` | `founder-badge.html` | Founder Badge; `price` omitted (DB-driven), `availability` and limited quantity described in text |
| `WebPage` / `AboutPage` / `ContactPage` | respective pages | With `inLanguage`, `isPartOf`, `datePublished` |

Rules:

- Every JSON-LD `description` reuses the canonical definition or a direct
  extract from this file.
- Structured data must never assert anything the visible page does not say —
  that is a Google structured-data policy violation and an honesty violation.
- All JSON-LD must parse. The validator does a `JSON.parse` on every block.

---

## 14. Open items requiring owner input

These are deliberately left blank rather than invented. Fill them in and re-run
the validator.

| Item | Why it's blank | Where to add it |
| --- | --- | --- |
| Social profile URLs | No social links exist anywhere in the codebase; inventing `sameAs` URLs would create false entity links | `Organization.sameAs` in each page's JSON-LD |
| Public support email | Only `you@example.com` (a placeholder) exists in the code | `ContactPoint` in `Organization`, and the FAQ contact answer |
| Founding year | Not recorded anywhere in the repository | `Organization.foundingDate` |
| Legal entity name & address | Not recorded in the repository | `Organization.legalName` / `address` |
| 1200×630 social share image | Only a 1024×1024 square logo exists | `assets/og-image.png`, then swap `og:image` and set `twitter:card` to `summary_large_image` |

Until the share image exists, pages use the square logo with
`twitter:card: summary`, which is the correct pairing for a square asset.
