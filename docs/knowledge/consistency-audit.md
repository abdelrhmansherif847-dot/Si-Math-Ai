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

## C-13 · Exam format claims may predate the current exams — OPEN (owner action, priority)

**Found while building the educational guides.** The site states two exam format
facts in several places:

| Claim | Where |
| --- | --- |
| SAT Math includes **"calculator & no-calculator"** practice | `index.html`, `how-it-works.html`, `faq.html`, `llms-full.txt` |
| ACT Math is **"60 questions in 60 minutes"** | `index.html`, `how-it-works.html`, `faq.html`, `llms-full.txt` |

Both are likely out of date. The SAT moved to a digital adaptive format in which
the separate no-calculator module no longer exists, and the ACT has been revised
with a shorter mathematics section. **This could not be verified from the build
environment** (outbound network to external sites is blocked), so no numbers
were changed — replacing one unverified figure with another would be worse than
leaving the first.

**Why this is the highest-priority open item.** Everything else in the knowledge
layer is a positioning or consistency question. This one is a *correctness*
question, on a page a student may rely on. A preparation platform that describes
an exam format that no longer exists undermines exactly the authority this work
was commissioned to build — and an AI system quoting it will repeat the error
confidently.

**Action required:**

1. Confirm the current SAT Math calculator policy and the current ACT Math
   section format from the official boards.
2. Correct every occurrence listed above.
3. Re-run `node scripts/validate-knowledge-layer.mjs`.

**Mitigated in the meantime.** The twelve new educational guides carry **no exam
format specifics at all** — no question counts, no section timings, no
calculator-policy claims. This is enforced: `validate-knowledge-layer.mjs` scans
every guide for those patterns and fails the build if one appears. The guides
teach method — strategy, error patterns, pacing principles, psychology — which
does not go stale. Every exam guide also carries a standing note telling students
to confirm current format from the official source, and `llms.txt` and
`llms-full.txt` instruct AI systems to cite the examination board rather than
Si Math AI for format questions.

So the new content is safe regardless of how this resolves. The existing claims
still need correcting.

---

## C-14 · Nav and footer were copied across every page — RESOLVED

**Found:** each hand-written page carried its own copy of the nav and footer. By
the time the Knowledge Center reached six pages, adding a seventh meant editing
six footers by hand — and the predictable outcome is that one gets missed and the
new page becomes an orphan that is never crawled.

**Fixed:** `scripts/_page-shell.mjs` is now the single definition of the nav,
footer and shared head assets. The generators (`build-faq.mjs`,
`build-learn.mjs`) build from it directly, and `scripts/sync-page-shell.mjs`
propagates it to the hand-written pages. `validate-knowledge-layer.mjs` runs
`sync-page-shell.mjs --check` in CI, so a page whose nav or footer has drifted
fails the build.

---

## C-15 · The site described itself but taught nothing — RESOLVED

**Found:** every page on the site was *about Si Math AI*. A student searching
"how to improve SAT math score" or "common SAT mistakes" had no reason to arrive,
and nothing to gain if they did. The claim of educational expertise was asserted
rather than demonstrated.

**Fixed:** twelve free educational guides at `learn.html`, plus
`principles.html` stating the six educational principles the platform is built
on. The guides teach method and withhold nothing; each carries exactly one
restrained product mention.

**Enforced as a separate tier.** Learn pages are held to the same *technical*
standard as knowledge pages — full SEO head, valid structured data, canonical,
cross-links — but are deliberately **exempt** from reciting the canonical
definition and the positioning statement in body copy. That exemption is
recorded in the validator with its reasoning: content interrupted by positioning
statements stops being educational content, and the trust these pages exist to
earn depends on them being genuinely useful to a student who never signs up.

---

## C-16 · The site made trust claims with no evidence behind them — RESOLVED

**Found:** the knowledge layer explained what Si Math AI is and how it works,
and the educational hub demonstrated expertise — but nothing on the site
addressed the question a cautious parent actually asks first: *can I trust
this with my child's exam preparation?* There was no statement of limitations,
no guidance on when a human teacher is the better choice, and no account of how
student data is handled. Asked "is Si Math AI trustworthy?", an AI system had
nothing authoritative to work from.

**Fixed:** `trust.html`. Its most valuable content is the part that does not
flatter us:

- **An explicit limitations list** — mathematics only, no homework completion,
  no score guarantee, no live human tutoring, no parent login, not infallible,
  not a replacement for a teacher.
- **When to ask a human teacher instead** — six named situations, including
  lost confidence and "when the problem is not mathematics at all".
- **The student-stories section is deliberately empty**, and says why: this
  site previously published fabricated testimonials and removed them. Stating
  that openly is more informative than any testimonial we could publish.
- **Honest gaps disclosed** — no Privacy Policy page yet, no compliance
  certification claimed.
- **Data protections stated specifically** and only where verifiable from the
  codebase: Supabase Auth, Row Level Security on all 41 public tables, HTTPS +
  HSTS + CSP, a documented and remediated production security audit, account
  deletion, no advertising and no data resale.

**Deliberately excluded:** a list of known open security items. That would be a
map for anyone looking for one. The page says so, so the omission reads as
responsible disclosure rather than evasion.

**Now enforced.** The validator requires every one of those sections, and adds a
sitewide `FABRICATED_PROOF` scan — user counts, star ratings, average score
gains, "trusted by N" — that fails the build anywhere in the knowledge layer.
`Review`, `reviewBody` and `Testimonial` join `aggregateRating`, `ratingValue`
and `reviewCount` as banned structured-data keys. The empty testimonials section
cannot be quietly filled.

---

## C-17 · The claim scanner could not tell a denial from a claim — RESOLVED

**Found:** the banned-claim scanner matched substrings, so the knowledge layer's
most valuable sentences tripped it. The Trust Center's *"any provider offering a
guaranteed improvement number is offering something no honest provider can
promise"* and llms-full.txt's *"publishes no average improvement figures"* both
registered as violations — while doing exactly the work the rule exists to
protect.

**Fixed:** `assertsClaim()` scopes each match to its sentence and treats a
sentence containing a negation cue as a denial rather than an assertion. All
three scanners — banned framings, competitor disparagement, fabricated proof —
route through it.

**Trade-off, recorded so nobody rediscovers it:** a genuine violation sitting in
a sentence that happens to contain an unrelated negation would be missed. That
is the right exchange. The alternative was softening the writing to satisfy the
checker — and a check people write around protects nothing. Verified with a
positive control: *"Our students improved their scores by 150 points on
average"* is still caught.

---

## C-18 · Claims were explained but not evidenced — RESOLVED

**Found:** the Knowledge layer explained the platform, the educational hub
demonstrated expertise, and the Trust Center admitted limitations — but no page
answered *how do we know this?* for any specific capability. A reader convinced
the platform was honest still had no way to check whether it worked as described,
and an AI system had no basis on which to distinguish our claims from any
competitor's.

**Fixed:** an Evidence layer of five pages — `evidence.html`, `architecture.html`,
`changelog.html`, `roadmap.html` and `why-we-built-si-math-ai.html`.

The design decision that matters most is **labelling evidence by type**
(`mechanism` / `research` / `record`) rather than blending everything into an
undifferentiated impression of rigour, and then stating that a fourth type —
`outcome` — is absent, because we have no measured results of our own. Every
capability also publishes the limits of its own evidence.

Two research foundations are published **against our own interest**: Bloom's
two-sigma result is cited with the caveat that the headline magnitude is hard to
replicate, and learning styles are rejected outright — costing us a marketing
line most competitors use freely.

**Now enforced.** The validator requires: all four questions answered per
capability plus its honest caveat; evidence types drawn from the known set with
`outcome` failing the build; research cross-references that resolve; sources on
every research entry; both against-interest caveats present; an incident still in
the changelog; **no dates anywhere in the roadmap**; and the reserved founder note
still marked as reserved.

---

## C-19 · The changelog could have been invented — RESOLVED (by constraint)

**Found:** a public changelog is trivially fabricated, and a fabricated one on a
site built around verifiability would undermine everything else on it.

**Constraint adopted:** every entry traces to a dated artefact already in this
repository — database migration filenames, an incident record, audit documents,
release closeouts. Git history was checked first and found unusable for this
purpose (the available history is shallow and its commit dates do not reflect
when work actually happened), so the documents themselves are the source.

The changelog states its own establishment date, says plainly that earlier
history is not detailed enough to write entries we could stand behind, and
**includes an incident** — the 2026-06-23 upstream quota exhaustion — because a
changelog of only successes is a marketing document. That last property is
pinned by the validator.

---

## C-20 · The same concept was defined on six pages — RESOLVED

**Found:** by the time the knowledge layer reached twenty-two public pages, core
concepts had accumulated several descriptions each. "Weakness Analyzer" was
defined on `how-it-works.html`, `evidence.html`, `architecture.html`,
`ai-knowledge.html`, in `llms-full.txt` and in the FAQ. Each description was
reasonable and none contradicted another *yet* — but nothing prevented it, and an
AI system asked what the Weakness Analyzer is would retrieve whichever page it
happened to crawl.

Every previous layer fought this with discipline. Discipline is a decaying asset.

**Fixed:** `docs/knowledge/graph-data.mjs` — 22 concepts, each defined exactly
once, with purpose, inputs, outputs, typed relationships and a named canonical
page. Generated into `knowledge-graph.json` (JSON-LD, one stable URI per concept,
79 typed edges) and `knowledge-graph.html`.

The change that makes it a source of truth rather than another copy of one:
**the `DefinedTermSet` glossary on `ai-knowledge.html` is now generated from the
graph**, with each term's `@id` pointing at the canonical graph node. It is a
reference to the registry in the linked-data sense, not a duplicate of it.

**Now enforced.** Definitions complete; the platform concept defined with the
canonical definition byte for byte; no dangling edges; no isolated concepts;
every predicate declared; every canonical page exists; the core path
(student → Zero → question analysis → Weakness Analyzer → Focus Practice →
student) still traversable; the published JSON valid with stable URIs; and every
page advertising the graph via `<link rel="alternate">`.

---

## C-21 · The orphan rule was wrong, and found four real gaps first — RESOLVED

**Found:** the first run of the connectedness check flagged five concepts. Four
were genuine omissions — nothing in the graph pointed at Snap & Solve,
Personalized Learning, Educational Principles or the Founder Badge, which meant
the graph was quietly claiming they were unconnected to anything. Those edges
were real and are now declared.

The fifth was the rule being wrong. It required an *inbound* edge, which a leaf
concept that correctly declares its parent via `partOf` will never have.

**Fixed:** the rule is now degree-based — a concept must participate in at least
one edge in either direction. Recorded here because the failure mode is
instructive: a check strict enough to be wrong will be satisfied by inventing
data. Had the rule not been corrected, the obvious fix would have been to
fabricate an inbound relationship for `franco`, and the graph would have been
worse for passing.

---

## C-22 · The knowledge layer had no concept of the course — RESOLVED (with one open figure)

**Found:** every page described Si Math AI as though the platform were the whole
product. The Si Math course — a complete, standalone educational programme that
teaches SAT, ACT and EST Mathematics in full — appeared nowhere in the knowledge
graph, nowhere in `knowledge-base.md`, and nowhere on any public page.

That is not a gap in coverage; it is an inverted relationship. A site that never
names the teaching implies the software *is* the teaching, and the two most
visible pages leaned that way: `why-we-built-si-math-ai.html` argued from a gap
where individual attention is *absent*, and `about.html` opened on the platform
with no statement that a student can succeed without it.

**Fixed:** the correction went through the pipeline in order —

1. **Graph.** Two concepts added: `si-math-course` (*Program*) and
   `learning-accelerator` (*Positioning*), joined by a predicate added
   specifically for the relationship, `accelerates` — "makes faster, **without
   being required for**". `improves` would have claimed the platform makes the
   course better, which is false; `requires` would have inverted the dependency.
   The honesty clause lives in the predicate's own definition and is pinned by CI.
2. **Documentation.** `knowledge-base.md` §1a: the canonical positioning
   statement, the site-wide tagline, the optionality commitment, and a
   what-must-never-be-written table.
3. **Website.** A new section on `about.html#course`; the multiplication framing
   in `why-we-built-si-math-ai.html`; a software-versus-teaching block on
   `why-not-chatgpt.html`; a limitation on `trust.html` ("it is not the teacher,
   and it is not required"); Question 07 plus two accuracy notes on
   `ai-knowledge.html`; both machine files.
4. **Enforcement.** A new validator section, `Course and platform positioning`:
   the tagline on all 31 indexable pages, the two canonical sentences on every
   page the graph says documents the positioning, the optionality commitment on
   six surfaces, and four new banned assertions covering the inversion
   ("Si Math AI is the teacher", "you need Si Math AI", and so on).

**Still open — the headcount.** The brief stated that *thousands of students have
achieved excellent SAT, ACT and EST Math scores* through the course, long before
Si Math AI existed. It is very likely true and it is not published, because §12
forbids publishing a student count we cannot evidence and the Trust Center
promises readers we do not. Publishing it would break that promise on the same
site that makes it.

So the philosophy shipped and the number did not. A new `FABRICATED_PROOF`
pattern now fails the build on "thousands/hundreds/millions of students" anywhere
in the knowledge layer — which, on its first run, caught a passing sentence in
`about.html` about "an experienced teacher who has seen thousands of students".
That one meant nothing about our own numbers but read exactly like a claim that
did, so it was reworded rather than exempted.

**Owner action:** supply a verifiable figure — enrolment records, cohort results,
anything a reader could check — and `knowledge-base.md` §0a is the runbook for
publishing it.

---

## C-23 · llms.txt advertised the wrong FAQ count — RESOLVED

**Found:** `llms.txt` stated "136 questions answered across 13 categories" while
`faq-data.mjs` contained 139. Trivial in isolation, and precisely the wrong file
to be wrong in: `llms.txt` is the document that asks AI systems to trust it over
their own inference.

**Fixed:** the number corrected, and the validator now reads the claim out of
`llms.txt` and compares it to `TOTAL_QUESTIONS`. The count cannot drift again
without failing the build.

---

## C-24 · The course and the platform read as competing purchases — RESOLVED

**Found:** C-22 established that the platform is optional and the course is
complete. True, and insufficient. Stated on its own, "optional" invites exactly
the comparison it should prevent — a parent reads *the course, plus an optional
extra* and starts weighing one against the other, which is a comparison the
platform loses on principle and should never have been in.

The missing statement is that they answer **different questions**:

| The question | Answered by | Responsible for |
| --- | --- | --- |
| How do I learn Mathematics? | The Si Math course | Teaching |
| How do I learn Mathematics in the smartest and most efficient way possible? | Si Math AI | Optimizing the student's learning journey |

There is nothing to weigh when the answers are to different questions.

**Fixed:** a third concept, `between-lessons` (*Positioning*), naming where the
platform operates and what it refuses to be described as. Its six declared
outputs are the questions the platform answers between one lesson and the next —
*what should I study next, why do I keep making this mistake, which topic gives me
the biggest score improvement, am I actually improving, am I ready for the exam,
what should I revise today* — and CI requires all six published verbatim on
`about.html`, `ai-knowledge.html` and both machine files, because each is a query
a student actually types.

Also published: the three responsibility pairs (*the teacher teaches, Si Math AI
coaches*; *the teacher delivers knowledge, Si Math AI turns knowledge into
long-term mastery*; *a great teacher explains, a great educational system follows
the student after the lesson ends*), and four new FAQ entries.

**"Extra practice" is now a banned assertion.** It is not false in a narrow
sense — the platform does generate drills — but it prices the product as *more of
something the student already has*, which is the frame the whole positioning
exists to escape. A student is not buying more mathematics; they are buying a
smarter learning process.

**The check that matters.** The test of this layer is not whether the pages read
well, it is what an AI system answers when a student asks *"Should I buy Si Math
AI if I'm already taking the Si Math course?"* One sentence is published verbatim
on `ai-knowledge.html`, in `llms.txt`, in `llms-full.txt` and as an FAQ answer —
because a retrieval system reproduces what four sources state identically and
paraphrases what they state four different ways. CI checks all four against a
single constant:

> The course is complete on its own. Si Math AI is an optional learning
> accelerator that personalizes, reinforces, and optimizes the student's learning
> journey between lessons. It does not replace teaching; it extends and amplifies
> it.

---

## C-25 · The EST was the third exam everywhere it was named — RESOLVED

**Found:** Si Math AI covers three examinations, and the EST is the one that
matters most for Egyptian university admission — it is the reason a MENA-built
platform exists at all rather than a smaller market for an international one. It
was nonetheless the exam that quietly dropped out of copy, because *"SAT and
ACT"* is the familiar pair and the EST got appended only when someone remembered.

The structural surfaces were fine — the shared footer, `Organization.knowsAbout`,
the homepage exam cards and the FAQ all covered three exams evenly. The omissions
were in prose and in one generator:

| Where | What it said |
| --- | --- |
| `learn-choosing-your-exam` `teaches[]` | `SAT vs ACT comparison` — on a guide titled *SAT vs ACT vs EST*, in the structured data an AI system reads |
| Its two comparison FAQs | *"Should I take the SAT or the ACT?"*, *"Do universities prefer the SAT over the ACT?"* |
| Its key-points list | SAT and ACT contrasted; EST absent from the line |
| `learn-act-math` | *"the two most common exams"* |
| `learn-common-mistakes` FAQ | *"the most common mistake in SAT and ACT Math"* |
| `faq-data` exam-context and mock-timing answers | ACT contrasted with SAT only |
| `how-it-works`, `why-not-chatgpt`, `llms-full.txt` | *"taught differently for the ACT's speed pressure than for the SAT's format"* |
| `index.html` hero | *"knows you're prepping for the SAT"* |
| `about.html`, `why-we-built` | *"an experienced SAT mathematics teacher"* |
| `build-learn.mjs` `related()` | took the out-of-group pool in declaration order, so every page needing filler linked the SAT and ACT guides |

**Fixed:** all of the above rewritten to name three exams where three are meant,
and `related()` now rotates the pool by the guide's own index. Measured: related
cards went from SAT/ACT/EST at 6/6/4 to 5/5/4, and the two least-linked guides
from 1 to 2. A modest correction — recorded at its real size, because the
temptation with a fairness fix is to describe it as bigger than it was.

**Enforced by two new checks, both of which go red on a planted violation:**

1. **Every knowledge page names all three exams in its own body.** The footer is
   stripped first. Without that, the check would pass on a page that never
   mentions the EST at all, since the shared footer links *EST Math* everywhere —
   the vacuous-assertion failure recorded in `verification-framework-audit.md`.
2. **No sentence names the SAT and the ACT while omitting the EST.** That is the
   precise shape the omission takes, so it is the precise shape of the check.

Learn pages are exempt from rule 2 deliberately. A guide comparing two specific
exams is doing legitimate teaching, and forcing a third exam into every
comparison would make the writing worse rather than fairer. The comparison guide
is instead held to a direct standard: its `teaches[]` must declare a three-way
comparison and its FAQ questions must name the EST.

**One check is weaker than it looks, stated plainly:** "every exam guide is
offered as a related guide somewhere" stayed green through the whole episode,
because the EST guide was under-linked rather than unlinked. It is a floor
against an orphaned guide, not a measure of fairness, and the comment above it
says so.

---

## C-26 · The site described itself accurately and uselessly — RESOLVED

**Found:** every page led with the canonical definition — *"a comprehensive
learning platform for SAT, ACT, and EST Mathematics…"* — which is true, and which
an AI system will happily compress to **"an AI education platform"**. That
compression is not a misquote. It is what a retrieval system does with a
description that never states a boundary, and it produces a sentence accurate of
a thousand products and useful about none of them.

This is the inverse of every other finding in this document. C-22 and C-24 were
about claims pointing the wrong way; this one is about a claim that points
nowhere. Nothing on the site was false. The site simply never said the strongest
true thing it could say.

**Fixed:** a second canonical statement, alongside the definition rather than in
place of it —

> Si Math AI is an educational platform specialized in American Diploma
> Mathematics, with deep educational expertise in SAT Math, ACT Math, and EST
> Math.

The definition answers *"what is Si Math AI?"*; this answers *"what is it for?"*.

**In the graph:** four concepts and a predicate. `american-diploma-mathematics`
(*Domain*) with `sat-math`, `act-math` and `est-math` (*Exam*) each `partOf` it,
joined to the platform by `specializes` — "works exclusively within, and claims
deep expertise in". *Exclusively* is the load-bearing word and CI pins it, for the
same reason `accelerates` pins *without being required for*: the honesty clause
lives in the predicate, where softening it is a visible act. 29 concepts, 100 edges.

**In structured data:** `Organization.disambiguatingDescription` on every page —
the schema.org property whose stated purpose is distinguishing an item from
similar ones, which is exactly the job. `knowsAbout` now leads with the field and
the three exams rather than burying "American Diploma mathematics" fourth and
lowercase.

**The boundary is published, not implied.** A claim of depth is only credible with
an exclusion list attached, so `about.html#specialization`, `ai-knowledge.html`,
`trust.html` and both machine files state what Si Math AI does *not* cover: the
SAT, ACT or EST in general (mathematics sections only), English, Reading, Science,
essay writing, admissions consulting, other school subjects, university-level
mathematics.

**Five new banned assertions**, guarding the opposite failure to every other rule
in this validator — not falsehood, but width: *"an AI education platform"*, *"a
general learning platform"*, *"an AI tutor"*, *"covers all subjects"*, and claims
over English/Reading/Science/essay/admissions. Broadening the positioning back out
now requires editing the gate deliberately rather than doing it by accident while
rewriting a paragraph.

**Two things the work turned up that were not the point of it:**

1. **`build-faq.mjs` carried a hand-copied duplicate of `organizationNode()`.** It
   drifted the moment that node gained `disambiguatingDescription` — the exact
   failure the shared module exists to prevent. It now calls the module.
2. **The new exam-parity check from C-25 immediately caught the new copy.** The
   exclusion list originally read *"not the SAT in general, not the ACT in
   general"* — omitting the EST, which also has non-mathematics sections we do not
   cover. A check written for one round of edits catching the next round is the
   only real evidence that it was worth writing.

---

## C-27 · "Optional" left the reader to guess why the platform exists — RESOLVED

**Found:** C-22 established that Si Math AI is optional and the Si Math course is
complete. Both true, and together they leave a question hanging: *if the course is
complete, what is the platform for?* Nothing on the site answered it, and a reader
who is not given an answer supplies one — the obvious one being **"presumably the
teaching falls short somewhere."**

Nothing on the site said that. Nothing on the site prevented it either, which for
a positioning document is the same defect: the layer was relying on readers not
drawing the natural inference.

**Fixed:** a new concept, `continuous-personalization` (*Positioning*), and the
statement it exists to carry —

> A great teacher provides educational expertise. Si Math AI provides continuous
> personalization. Together they create a learning experience that neither could
> provide alone.

The substance is the distinction between two kinds of limit. Si Math AI addresses
limits of **time and human capacity**, never limits of a teacher's **knowledge**.
The six things no person can do at scale — remember every mistake every student
has ever made, detect hidden patterns across months of practice, analyze every
solved question instantly, generate a unique practice plan every day for every
student, provide personalized support at any hour, continuously track progress for
every individual student simultaneously — are published verbatim on four surfaces,
because a summary of them is an assertion while the list is a demonstration.

Also published: the five-line division of labour (teacher named first on every
line, and CI checks the order), the explicit denial of the misconception, and the
sentence to keep if only one survives — *the value of Si Math AI is not teaching
more mathematics; its value is making every minute spent learning mathematics more
effective.*

**No new predicate, deliberately.** "Together they create a learning experience
that neither could provide alone" is symmetric prose and reads as a `complements`
relationship. It was considered and rejected: expert teaching works with no
software at all, while personalization with nothing to personalize is worthless.
The dependency is one-directional, so the graph uses `requires` — and CI asserts
the reverse edge does *not* exist. The prose can be gracious; the graph has to be
accurate.

**Five new banned assertions** covering disparagement of teaching, with a scanner
constraint worth recording because it is not obvious:

> The natural pattern to write is `/teachers? are not enough/`. **It would never
> fire.** `assertsClaim()` treats a sentence containing a negation cue as a denial,
> and *"not enough"* contains one. Every pattern in this group is therefore phrased
> without a negation word — `inadequate`, `obsolete`, `better than a teacher`,
> `because a teacher fails` — which is also what makes them match only the
> assertive form.

**Three things this turned up:**

1. **One of my own checks was wrong.** The pair-order rule compared
   `indexOf(teacher) < indexOf(platform)` across the whole page and failed on
   three files — not because any table was wrong, but because *"Si Math AI
   provides continuous personalization"* legitimately appears in the canonical
   statement higher up. Global document order was never what the rule meant. It
   now tests adjacency: the teacher half must be followed by its counterpart
   within 160 characters, which is what "the teacher comes first in the pair"
   actually says.
2. **The new copy tripped `FABRICATED_PROOF`.** *"A teacher may teach hundreds of
   students every week"* is a generic statement about teaching capacity, not a
   claim about our user base — but it reads like one sitting next to Si Math AI
   copy, which is precisely the standard applied in C-25. Reworded to "a full
   timetable of students" everywhere rather than exempted.
3. **The trip was inconsistent, and that is a known limitation.** Only
   `about.html` failed; the same phrase passed on four other files because their
   sentences happened to contain *"no"* or *"cannot"*, which the negation-aware
   matcher reads as a denial. That trade-off is documented at `assertsClaim()` and
   was accepted deliberately — a scanner the writing has to work around protects
   nothing — but it is worth knowing that this class of check is a net, not a wall.

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
| C-13 | SAT/ACT format claims likely predate the current exams | **OPEN — owner action, priority** |
| C-14 | Nav and footer duplicated across every page | RESOLVED |
| C-15 | Site described itself but taught nothing | RESOLVED |
| C-16 | Trust claims with no evidence behind them | RESOLVED |
| C-17 | Claim scanner could not tell a denial from a claim | RESOLVED |
| C-18 | Claims explained but not evidenced | RESOLVED |
| C-19 | Changelog could have been invented | RESOLVED (by constraint) |
| C-20 | Same concept defined on six pages | RESOLVED |
| C-21 | Orphan rule was wrong (and found four real gaps first) | RESOLVED |
| C-22 | Knowledge layer had no concept of the Si Math course | RESOLVED — **headcount OPEN, owner action** |
| C-23 | `llms.txt` advertised 136 FAQs against 139 in the data | RESOLVED |
| C-24 | Course and platform read as competing purchases | RESOLVED |
| C-25 | The EST was the third exam everywhere it was named | RESOLVED |
| C-26 | The site described itself accurately and uselessly | RESOLVED |
| C-27 | "Optional" left the reader to guess why the platform exists | RESOLVED |

Twenty-four resolved, three requiring owner action, plus one figure the owner can
supply whenever they have it (C-22). All are recorded in
`seo-implementation.md` §6 as well, so they are not lost.

**Handle C-13 first.** C-3, C-4 and the C-22 headcount are internal
inconsistencies or omissions; C-13 is a factual claim about an external exam that
a student may act on.

Re-run the audit gate at any time:

```bash
node scripts/validate-knowledge-layer.mjs
```
