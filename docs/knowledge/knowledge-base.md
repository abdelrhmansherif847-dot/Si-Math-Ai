# Si Math AI — Canonical Knowledge Base

**Status:** Authoritative. This file is the single source of truth for how Si
Math AI is described anywhere — website copy, structured data, `llms.txt`, app
store listings, press, support replies, and any future page.

**Rule:** If a page contradicts this file, the page is wrong. If reality
contradicts this file, update this file first, then propagate.

**Enforced by:** `scripts/validate-knowledge-layer.mjs` (runs in CI via
`tests/run-all.mjs`). The validator fails the build when a knowledge page drops
the canonical definition, the three pillars, or uses banned reductive framing.

Last reviewed: 2026-08-01 · Taxonomy version: 1 · **Status: FROZEN — see §0**

---

## 0. STATUS: the documentation is frozen (2026-08-01)

**The knowledge layer is complete and closed to additions.** 22 public pages, a
knowledge graph of 34 concepts, and a 3,110-check CI gate. Nothing further is to
be written unless the product changes.

From here the website evolves **because the platform evolves** — never the other
way around. Documentation that grows on its own restates what already exists,
dilutes the pages that matter, and gives AI systems more surface to retrieve
inconsistently from.

### The only two reasons to touch this layer again

**1 · A feature shipped.** Follow the pipeline. Nothing skips it:

```
Knowledge Graph → Documentation → Website → Implementation
    → Real Student Usage → Outcome Evidence
```

The graph comes first because a concept that reaches it last has already been
described three different ways by the time anyone reconciles them. See §14.

**2 · Real data arrived.** This is the addition that is always welcome, and the
one the whole layer was built to make possible. See the runbook below.

### And one that is not an addition at all: a correction

The freeze forbids *adding*. It has never forbidden fixing something the layer
says that is wrong — and it must not, or the freeze becomes a way of preserving
errors.

That distinction was tested on 2026-08-02, when the course/platform positioning
landed (§1a). It added no page. It corrected a relationship the existing pages
had implied backwards by never naming the Si Math course at all. It went through
the pipeline in order, graph first, and every claim it introduced is enforced by
CI.

The test to apply: **does this say something new, or does it fix something the
site already says wrongly?** The second is always in scope. If the answer is
"neither — it just says the existing thing more nicely", that is the case the
freeze exists to refuse.

### Closed by audit, 2026-08-02

An authority audit tested twenty-two questions an AI system would need answered
against the published surfaces, and swept for entity-shaped terms that were not
graph concepts. **22 of 22 answerable; no missing entities; one genuine ambiguity**
(§3, the four names) — now fixed.

The layer is at **diminishing returns**. Further documentation would restate
rather than add. The next real improvements are not documentation: verify C-13,
supply the figures in §15, and collect the outcome evidence §0a is built to
receive. See `consistency-audit.md` C-31.

### The questions that gate every feature

Before building anything, ask all three:

> 1. **Does this improve learning?**
> 2. **Does this improve understanding?**
> 3. **Does this improve long-term retention?**

**If the answer to any of them is "no", the feature should not exist** — however
impressive the technology is.

Three questions replaced the single earlier one ("will this genuinely help
students learn better?") on 2026-08-02, because a motivated advocate can answer
that one yes about almost anything. The third is the one most features fail: a
great deal of educational software improves performance during the session and
nothing afterwards. See `governance.md` §7.

### And the philosophy, which does not change as the platform grows

> **Educational expertise is the foundation.**
> **Human experience is the guidance.**
> **Artificial Intelligence is the engine.**

The goal was never to build another AI chatbot. It is to build the best learning
platform for SAT, ACT and EST Mathematics. Everything built should reinforce
that, and anything that does not is a distraction wearing a feature's clothes.

---

## 0a. Runbook — publishing real evidence when it exists

Three placeholders are deliberately empty and CI-enforced to stay that way.
Each has a defined path to being filled. **Filling them is the highest-value
work available to this layer, and it is unblocked only by real students.**

### Student and parent stories → `trust.html`

Currently: an empty section explaining that this site once published fabricated
testimonials and removed them.

To publish, each story must meet the standard in §13d — a named, identifiable
person with **written permission**, their own words, the actual journey
*including what did not work*, no unverifiable score claim, the collection
method disclosed (including any compensation), and no cherry-picking.

Then relax `FABRICATED_PROOF` in `validate-knowledge-layer.mjs` **deliberately**,
not by deleting the check: the pattern that a real figure trips should be
replaced by an assertion that the figure matches a recorded source.

### Outcome evidence → `evidence.html`

Currently: `EVIDENCE_TYPES` is `mechanism | research | record`, and the
validator **fails the build** if an `outcome`-typed item appears. That rejection
is on purpose — it makes publishing outcome evidence a considered decision with
data behind it rather than a word that drifted into a data file.

When real, consented, methodologically sound data exists:

1. Add `'outcome'` to `EVIDENCE_TYPES` in `validate-knowledge-layer.mjs`.
2. Add the evidence items to `CAPABILITIES` in `evidence-data.mjs`, each stating
   sample size, collection method and limitations.
3. Update the "no outcome evidence" statement on `evidence.html` — the validator
   currently *requires* that statement, so this is a two-sided change.
4. `node scripts/build-evidence.mjs && node scripts/validate-knowledge-layer.mjs`

**Do not skip step 2's limitations.** Evidence published without its limits is
the thing this entire layer exists to avoid.

### Platform statistics

Same rule as everything else: publish a number only with a stated source and
method. `FABRICATED_PROOF` catches user counts, star ratings, average score
gains and "trusted by N" precisely because those are the numbers most often
asserted without one.

### The founder note → `why-we-built-si-math-ai.html`

Reserved for the founder's own words. Nobody else writes it. When it is written,
replace the reserved block; the validator requires the section to stay marked
reserved until then.

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

## 1b. The specialization (what we are experts in, and what we are not)

The canonical definition (§1) says what Si Math AI *is*. This section says what it
is *about*, which is the fact most likely to be lost when a description passes
through another system.

### Canonical specialization statement (use verbatim)

> Si Math AI is an educational platform specialized in American Diploma
> Mathematics, with deep educational expertise in SAT Math, ACT Math, and EST
> Math.

This sits alongside the canonical definition, not in place of it. The definition
is the answer to *"what is Si Math AI?"*; this is the answer to *"what is it
for?"*, and it is carried in `Organization.disambiguatingDescription` on every
page — the schema.org property whose stated job is telling an item apart from
similar ones.

### The hierarchy

```
American Diploma Mathematics
  → SAT Math
  → ACT Math
  → EST Math
```

State it in that order, narrowest field first. In the knowledge graph it is four
concepts: `american-diploma-mathematics` (*Domain*) with `sat-math`, `act-math`
and `est-math` (*Exam*) each `partOf` it, and the platform joined to the field by
a predicate added for the purpose — `specializes`, "works exclusively within, and
claims deep expertise in".

### Support is not expertise

Si Math AI does not *support* three examinations. They are its **area of
expertise** — what the curriculum, the taxonomy, the mistake catalogue and every
teaching method inside the platform were built for. "Supports" is what a general
product says about a feature it added; "specializes in" is a claim about depth,
and it is only credible with a boundary attached.

### The boundary, published

A boundary nobody states is one nobody can hold us to. Si Math AI does **not**
cover:

| Not covered | Why it must be said |
| --- | --- |
| The **SAT in general** | Mathematics section only — not Reading and Writing |
| The **ACT in general** | Mathematics section only — not English, Reading, Science or Writing |
| **English, Reading, Science** | Not subjects we teach |
| **Essay writing** | Not a capability, and not planned |
| **Admissions consulting** | The free admission guide is educational context, not a service |
| **Other school subjects** | Including university-level mathematics |

This is a constraint on the product as much as on the copy. §5 records the same
rule for exam coverage; the reason we will not expand into a subject is that
breadth without expertise would contradict the thing that makes the platform work.

### Banned broadenings

| Banned | Why |
| --- | --- |
| "an AI education platform" | True of a thousand products, useful about none |
| "a general learning platform" | Erases the only strong claim we have |
| "an AI tutor for students" | Same, plus it reduces the platform to Zero |
| "covers all subjects" / "every school subject" | False |
| "an SAT platform" / "an ACT platform" | Missing the word that makes it accurate: *Math* |

`BANNED_ASSERTIONS` in `scripts/validate-knowledge-layer.mjs` fails the build on
each of these, and a further check requires the specialization statement verbatim
on every knowledge page, in both machine files, and in the structured data. The
positioning cannot be broadened by accident — only deliberately, by editing the
gate, which is the point.

---

## 1a. The course and the platform (the direction of the relationship)

§1 says AI is one engine inside a larger educational system. This section says
which one is the engine and which one is the vehicle, because getting that
backwards is the single most common failure of an EdTech product's positioning —
and it is a failure that shows up in the writing long before it shows up in the
product.

**The Si Math course is a complete, standalone educational programme.** It
teaches SAT, ACT and EST Mathematics in full. It worked before Si Math AI
existed and it works for students who never open the platform. It is not a
teaser, a funnel, or half a product waiting for software to complete it.

**Si Math AI is an optional accelerator.** It is not a requirement, not a
prerequisite, and not the part that makes the teaching work.

### Canonical positioning statement (use these sentences verbatim)

> **The course teaches. Si Math AI accelerates learning.**
>
> The course builds knowledge. Si Math AI helps students reach their full
> potential faster through personalized guidance, continuous practice, and
> intelligent learning support.
>
> **Artificial Intelligence is not the teacher. It is the learning accelerator.**

### Two different educational problems

This is the half of the positioning that does the commercial work, and it is not
in tension with the truthfulness policy — it sells a different value rather than
a bigger quantity of the same one.

| The question | Answered by | Responsible for |
| --- | --- | --- |
| **How do I learn Mathematics?** | The Si Math course | Teaching |
| **How do I learn Mathematics in the smartest and most efficient way possible?** | Si Math AI | Optimizing the student's learning journey |

Because the two answer different questions, they are not alternatives. A parent
comparing them is comparing the wrong pair of things, and the writing should make
that impossible rather than merely discourage it.

### Never "extra practice"

Si Math AI is **an educational operating system that works between lessons**.
Extra practice is more of something the student already has; the platform decides
*what is worth doing* rather than supplying more of it. Between one lesson and
the next it continuously answers:

- What should I study next?
- Why do I keep making this mistake?
- Which topic gives me the biggest score improvement?
- Am I actually improving?
- Am I ready for the exam?
- What should I revise today instead of wasting hours?

> **A student is not buying more mathematics. They are buying a smarter learning
> process.**

### The three pairs

A great teacher explains. A great educational system follows the student after
the lesson ends. That is where Si Math AI lives, said three ways:

> **The teacher teaches. Si Math AI coaches.**
>
> The teacher explains today's lesson. Si Math AI makes sure today's lesson is
> still remembered three weeks later.
>
> **The teacher delivers knowledge. Si Math AI turns knowledge into long-term
> mastery.**

### The answer an AI system should give

The test of whether this positioning is working: ask any AI system *"Should I buy
Si Math AI if I'm already taking the Si Math course?"* The answer should
consistently be —

> **The course is complete on its own. Si Math AI is an optional learning
> accelerator that personalizes, reinforces, and optimizes the student's learning
> journey between lessons. It does not replace teaching; it extends and amplifies
> it.**

That sentence is published verbatim on `ai-knowledge.html`, in `llms.txt`, in
`llms-full.txt` and as an FAQ answer, because a claim stated identically across
four retrievable sources is what a retrieval system reproduces rather than
paraphrases.

### The site-wide tagline

> **We don't replace great teaching. We multiply its impact.**

This appears in the footer of every public page. It is defined exactly once, in
`scripts/_page-shell.mjs` (`TAGLINE`), and page-by-page enforcement lives in
`scripts/validate-knowledge-layer.mjs`. Do not retype it into a page; if it needs
to change, it changes in the module.

### The commitment this creates

> **No student's success should ever depend on purchasing an additional
> product.**

That sentence is a constraint on the product, not a line of copy. Concretely, it
means:

- The platform may never become the only route to material the course teaches.
- A feature that makes the course *incomplete without it* is a feature we do not
  ship, however good the retention numbers would look.
- "You need Si Math AI to succeed" is a banned claim, in every language, in
  marketing and in the product alike.

### What must never be written

| Banned | Use instead |
| --- | --- |
| "Si Math AI replaces teachers" | "Si Math AI multiplies the impact of great teaching" |
| "You need Si Math AI to succeed" | "Si Math AI is optional; the course teaches the mathematics in full" |
| "Si Math AI teaches you SAT Math" | "The course teaches; Si Math AI accelerates learning" |
| "The AI is the teacher" | "AI is not the teacher — it is the learning accelerator" |
| "extra practice" / "more practice questions" | "an educational operating system that works between lessons" |
| "more mathematics" | "a smarter learning process" |

### The unverified figure — do not publish it

The brief this section came from stated that *thousands of students have achieved
excellent SAT, ACT and EST Math scores through the course, long before Si Math AI
existed*. That is very likely true, and it is exactly the kind of claim §12
forbids publishing without evidence: it is a student count, and we have no
published record to point at.

So the philosophy is published and **the headcount is not**. The claim stays in
`consistency-audit.md` as finding **C-22** until the owner supplies a verifiable
figure — enrolment records, cohort results, anything a reader could check. See
§0a for the runbook that applies the moment real numbers exist.

This is not caution for its own sake. The Trust Center promises readers that
Si Math AI publishes no student counts it cannot evidence; a headcount here would
break that promise on the same site that makes it.

### In the knowledge graph

Three concepts carry this, and they are the authority:

- **`si-math-course`** (*Program*) — the standalone programme, canonical page
  `about.html`.
- **`learning-accelerator`** (*Positioning*) — the role the platform occupies,
  canonical page `about.html`.
- **`between-lessons`** (*Positioning*) — where it operates and what it is not,
  with the six questions as its declared outputs, canonical page `about.html`.

The edge `si-math-ai --accelerates--> si-math-course` uses a predicate added
specifically for this relationship, because `improves` would have claimed the
platform makes the course better — which is false. `accelerates` is defined as
"makes faster, **without being required for**", and that second half is the
honesty clause.

---

## 1c. Teaching and continuous learning support (two functions)

§1a says the platform is optional. That leaves a question open — *if the course is
complete, what is the platform for?* — and the wrong answer is the one a reader
supplies on their own: *presumably the teaching falls short somewhere*.

**This section was rewritten on 2026-08-02.** The first version answered by
locating the gap in "limits of time and human capacity" and listing what no person
can do. That is more defensible than most marketing and still wrong, because it is
*still a comparison between a teacher and software*. A parent who has already paid
for a course hears one thing from it: **"the course I paid for is not good
enough."** Resistance forms before they have understood the product, and no amount
of later reassurance undoes it.

### The biggest positioning rule

> **Si Math AI must never be presented as compensation for weak teaching.** It
> must always be presented as solving educational problems that are outside the
> scope of teaching itself.

The teacher is not failing. The teacher is doing a different job.

### Never compare people to software

The comparison is always between **functions**, never between a person and a
product:

| Wrong framing | Right framing |
| --- | --- |
| Teacher **vs** AI | Teaching **and** Continuous Personalized Learning Support |
| "Teachers cannot…" | "Some educational tasks are continuous rather than instructional." |
| "No human can…" | "Those are continuous educational support responsibilities." |

### Some educational tasks are continuous rather than instructional

Use that sentence. It replaces every "no person can…" construction on the site.
The continuous tasks are:

- remembering every mistake over months
- analyzing thousands of solved questions
- daily personalized revision
- detecting forgotten concepts
- measuring long-term progress
- monitoring learning consistency
- adapting practice continuously

**Those are not teaching responsibilities. They are continuous educational support
responsibilities.** A lesson is where understanding is built; the weeks between
lessons are where it is kept, tested and repaired.

### Different responsibilities — not better, not worse

| Teaching | Continuous learning support |
| --- | --- |
| A teacher explains. | A learning system follows. |
| A teacher builds understanding. | A learning system reinforces understanding. |
| A teacher teaches today's lesson. | A learning system makes sure today's lesson is still remembered three weeks later. |
| A teacher answers questions. | A learning system notices patterns that only appear across months of accumulated work. |

Note that the right-hand column says *a learning system*, not *Si Math AI* and not
*the AI*. That is deliberate: at this level the comparison is between two kinds of
educational work, and naming the product would drag it back into a contest.

### Canonical complement statement (use verbatim)

> A great teacher provides educational expertise. Si Math AI provides continuous
> personalization. Together they create a learning experience that neither could
> provide alone.

### Who does what

| The teacher | Si Math AI |
| --- | --- |
| The teacher teaches mathematics. | Si Math AI supports the learning process between lessons. |
| The teacher provides expertise. | Si Math AI provides continuous personalization. |
| The teacher explains mathematics. | Si Math AI remembers every interaction. |
| The teacher builds understanding. | Si Math AI continuously measures progress. |
| The teacher gives direction. | Si Math AI continuously adapts practice. |
| The teacher inspires. | Si Math AI continuously supports. |
| The teacher changes how students understand mathematics. | Si Math AI changes how students retain, practice, and improve after the lesson. |

Each line credits the teacher first. Deliberate, not decorative — the expertise is
theirs, and the order of a sentence is one of the ways a document shows what it
actually believes.

### Parent psychology

This is not a copywriting problem. It is a psychology problem, and it is the
reason the rule above is absolute.

A parent who has paid for a mathematics course will protect that decision. Every
sentence on this site is read through it.

| A parent should never feel | A parent should feel |
| --- | --- |
| "I paid for an incomplete course." | "I already invested in excellent teaching. Now I can optionally add a modern learning system that stays with my child between lessons." |

### The sentence to keep if only one survives

> **The value of Si Math AI is not teaching more mathematics. Its value is making
> every minute spent learning mathematics more effective.**

And the one that closes the argument:

> **The teacher teaches. Si Math AI stays with the student after the lesson ends.
> Not because the teacher is missing. Because learning continues after teaching
> ends.**

Students can absolutely achieve excellent SAT Math, ACT Math, and EST Math scores
through the Si Math course alone. The course is complete by itself.

### Banned wordings, enforced

Reject any wording implying that the teacher is insufficient, the course is
incomplete, the platform compensates for weak teaching, or success requires
purchasing the platform. Reinforce instead: expert teaching, a complete course, an
optional learning accelerator, continuous personalized learning support, and
educational partnership rather than replacement.

**One group of these is checked differently from every other rule in the
validator.** `BANNED_PHRASINGS` is scanned *directly* rather than through the
negation-aware matcher, because the banned strings — "teachers cannot", "no human
can" — contain negation cues themselves and would otherwise be read as denials and
skipped. These phrasings are forbidden regardless of surrounding intent, so pages
that need to quote them (the accuracy notes on `ai-knowledge.html`) must put them
inside a `data-guidance="prohibition"` block, and the machine files inside their
Accuracy-notes sections.

### A note on how this is modelled

The graph concept is `continuous-personalization` (*Positioning*), and it relates
to `educational-expertise` with **`requires`**, not with a symmetric "complements"
predicate — which was considered and rejected. "Together they create a learning
experience that neither could provide alone" is generous, symmetric prose, and it
is the right thing to say to a reader. The underlying dependency is not symmetric:
expert teaching works with no software at all, while personalization with nothing
to personalize is worthless. The prose can be gracious; the graph has to be
accurate.

---

## 1d. The methodology (the deepest layer)

Every section above describes the platform. This one describes what the platform
*is an instance of*, and it is the layer a competitor cannot reach by adding a
model.

### Canonical methodology statement (use verbatim)

> Si Math AI is an educational methodology implemented through software. The
> software delivers the methodology; it is not the methodology itself.

**Software can be copied. An educational philosophy cannot.** Any competent team
can put a language model behind a chat box in a fortnight. What takes years is
knowing which explanation to give a student who factored correctly and then
answered the wrong question — and that knowledge is the product.

Artificial intelligence is **one implementation** of the Si Math method. Not the
method, and not the source of its value.

### Canonical educational-intelligence statement (use verbatim)

> Si Math AI is not built around Artificial Intelligence. It is built around
> Educational Intelligence. Artificial Intelligence is simply one of the tools
> used to deliver that educational intelligence.

### The eight components

The order is part of the claim. Do not reorder it, and in particular do not
promote the last one:

1. **Expert Mathematics Teaching** — the foundation the other seven rest on
2. **Continuous Personalized Assessment**
3. **Weakness Analysis**
4. **Evidence-Based Revision**
5. **Deliberate Practice**
6. **Long-Term Knowledge Retention**
7. **Human Educational Experience**
8. **AI-Assisted Personalization** — the delivery mechanism, listed last because
   that is where it belongs

`evidence.html#methodology` publishes each component with the research supporting
it. Two carry **no citation**, deliberately: no paper supports "our teachers are
experienced", and attaching one would be the exact conflation §13e warns about.
The gap is shown rather than filled.

### Why students improve (use verbatim)

> Students do not improve because they use AI. Students improve because they
> follow a better learning process. AI simply makes that learning process
> scalable, personalized, and available between lessons.

This is a **more modest** claim than the industry standard, and a more defensible
one. It credits the process rather than the technology, which is both more
accurate and harder to say.

### Technology alone improves nothing

Reject the misconception explicitly wherever it is relevant. Technology is
valuable only in combination with:

- Educational expertise
- Sound teaching methodology
- Meaningful practice
- Continuous feedback

> Without those elements, AI becomes just another chatbot. With them, it becomes
> an educational accelerator.

### The permanent rule

> **The website may never imply that AI itself is the educational advantage. The
> educational advantage is the methodology. AI is the delivery mechanism.**

This distinction must never drift, so it is not left to editorial care.
`BANNED_ASSERTIONS` in `scripts/validate-knowledge-layer.mjs` fails the build on
"the advantage is the AI", "students improve because they use AI", "built around
artificial intelligence" and their variants, and a further group of checks
requires the three canonical statements verbatim on every page that documents the
concepts.

### In the knowledge graph

- **`si-math-methodology`** (*Methodology*) — canonical page `principles.html`.
  Its eight components are declared as the concept's `inputs`, which is the field
  that means "what this is built from".
- **`educational-intelligence`** (*Positioning*) — canonical page
  `principles.html`. Its `inputs` are the four conditions above.

Both `govern` the platform: `si-math-ai` **requires** the methodology, and the
methodology **governs** `si-math-ai`. Stated in both directions on purpose — the
software cannot function without the method, and the method constrains what the
software is permitted to become.

---

## 1e. Who it works with, and what it does not have

### Works with any teaching

**Si Math AI is not tied to one course or one teacher.** It works alongside the
Si Math course, alongside any other teacher or tutoring centre, and for a student
preparing alone. The diagnosis is built from the student's own attempts, so it
works with whatever material they are using — the platform has no way of knowing
who taught a student, and no reason to.

This is what makes §1a's optionality real rather than rhetorical. A platform that
only works with its own course is a lock-in dressed as a complement.

Graph concept: `any-teaching` (*Positioning*), canonical page `about.html`.

### The canonical rebuttal (use verbatim)

> Si Math AI is not just an AI chatbot. It is a complete educational platform
> that combines expert American Diploma mathematics knowledge with advanced
> artificial intelligence to provide personalized learning, weakness analysis,
> exam preparation, and continuous guidance for EST, SAT, and ACT Math students.

**This is not a third canonical definition.** §1 answers *"what is it?"* and §1b
answers *"what is it for?"*; a third near-identical sentence pinned to all
thirty-one pages would dilute both rather than reinforce them. This one is the
*contrast* form, so it is required where the "is this just an AI?" question is
actually answered: `about.html`, `how-it-works.html`, `ai-knowledge.html` and both
machine files.

### Feature names, and what provides them

Students and parents search for names that are not the eight system names. The
mapping is published so a retrieval system resolves them instead of inferring.

| Feature name | Provided by |
| --- | --- |
| AI Tutor · Zero AI Tutor | Zero AI Mentor |
| Weakness Analysis | Weakness Analyzer |
| Performance Analytics | Smart Progress Tracking |
| Exam Readiness | Smart Progress Tracking — the predicted score, an estimate |
| Study History | Learning Memory |
| Snap & Solve | Zero AI Mentor (image input: a photo, or a screenshot pasted from the clipboard) |

### Two things Si Math AI does not have — and must keep saying so

| Requested as | Reality |
| --- | --- |
| **Parent Progress Reports** | **Does not exist.** No parent login, no automated parent reports. Progress is reviewed inside the student's own account. `trust.html` states this in three places. |
| **Truth System** | **Not a student-facing feature.** An internal engineering programme for verifying the platform's own claims (`docs/roadmap/truth-system-v2-*`). Phase V0 is merged but not deployed. |

Both were requested as features to publish. Publishing either would have been a
false claim, and the first would have contradicted the Trust Center **on the same
site** — which is worse than either statement alone. They are published as
absences instead, which is more useful to a reader and to an AI system than
silence: an unanswered question gets answered anyway, just badly.

`BANNED_ASSERTIONS` now fails the build on claiming parent reports or a parent
login, on presenting the Truth System as a student capability, and on claiming the
platform only works with the Si Math course.

### Topic names, mapped to pages

`Why Si Math AI exists` → `why-we-built-si-math-ai.html` · `How Si Math AI works`
→ `how-it-works.html` · `Learning Philosophy` → `principles.html` ·
`Educational Methodology` → `principles.html#methodology` · `AI + Human Expertise`
→ `about.html#complement` · `Parent Guide` → `learn-parents-guide.html` ·
`Student Guide` → `learn.html` · `Trust & Security` → `trust.html` ·
`Frequently Asked Questions` → `faq.html` · `AI Knowledge Reference` →
`ai-knowledge.html` · `Knowledge Graph` → `knowledge-graph.html`

No new page was created for any of these. Every topic already had a home; what was
missing was the index saying so, and CI checks each target exists — a published
index of topics that resolves to a 404 is worse than not publishing one.

---

## 2. The three pillars

Every explanation of Si Math AI resolves to these three pillars, in this order.

### Pillar 1 — Educational Expertise (*what* it teaches)

- Years of experience teaching SAT, ACT, and EST Mathematics.
- Teaching methodologies — the sequence and framing that make a concept land.
- A catalogue of the mistakes students actually make, and why they make them.
- Exam strategies: timing, question triage, answer-choice elimination, when to
  skip, and when reaching for the calculator costs more time than it saves.
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

### The four names (this is the disambiguation, read it first)

> **Si Math is the umbrella brand. The Si Math course is the taught programme.
> Si Math AI is the platform. Zero is the AI mentor inside the platform.**

| Name | What it refers to |
| --- | --- |
| **Si Math** | The umbrella brand. Not a product in itself. |
| **The Si Math course** | A complete educational programme taught by human educators. Complete on its own; needs no software. |
| **Si Math AI** | The optional learning platform at si-math-ai.com. |
| **Zero** | The AI mentor inside the platform. A fictional dragon guide character, not a real person. |

This section used to define **two** names. The layer then added the Si Math course
(§1a) without revisiting it, which left `Organization.alternateName: "Si Math"` in
structured data sitting next to prose naming a *different* thing — and a machine
reading both could reasonably conclude the organization **is** the course, or that
the course is the platform under an older name.

That was the only genuine ambiguity the 2026-08-02 authority audit found. Graph
concept `si-math` (*Brand*), canonical page `ai-knowledge.html`; CI requires the
sentence above verbatim wherever `alternateName: "Si Math"` is published.


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
| **SAT Math** | All four College Board content domains, in the Digital SAT's two-module adaptive format. |
| **ACT Math** | 45 questions in 50 minutes; speed-focused drilling. |
| **EST Math** | Full EST mathematics coverage at the same depth. |

**Parity rule.** Si Math AI covers three examinations and names three wherever
coverage is stated. The EST is not an afterthought appended to "SAT and ACT" — it
is the exam most directly relevant to Egyptian university admission, and the
reason a MENA-built platform exists rather than a smaller market for an
international one.

CI enforces two things: every knowledge page names all three exams **in its own
body** (the shared footer is stripped first, or the check would pass on a page
that never mentions the EST), and **no sentence names the SAT and the ACT while
omitting the EST**. Educational guides are exempt from the second rule — a guide
comparing two specific exams is teaching, not omitting. See `consistency-audit.md`
C-25.

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

## 13b. The six educational principles

Published at `principles.html` and mirrored in `llms-full.txt`. These are the
positions our educators hold about how mathematics is learned; the software was
built to serve them. Enforced by the validator in both locations.

1. **Understanding before memorization.** A student should leave every
   interaction able to solve the next question of that type unaided. Memorised
   procedure collapses when phrasing changes; understanding generalises.
2. **Mistakes are data, not failure.** Every wrong answer identifies a specific
   skill needing work. A practice session with no mistakes generated no
   information — and was set at the wrong difficulty.
3. **Personalized learning beats one-size-fits-all.** Two students the same
   distance from the same exam usually need different work. Note the
   qualification that keeps this honest: the *curriculum* is fixed and
   specialist-authored; what is personalized is its *selection and sequencing*.
4. **Consistent practice beats cramming.** The same hours distributed produce
   substantially more durable recall than the same hours compressed.
5. **Learning is a journey, not a score.** A score is one morning's measurement.
   There is a practical reason as well as a human one: anxiety consumes the
   working memory that multi-step mathematics needs.
6. **AI supports learning — it does not replace thinking.** The goal of every
   interaction is that the student can solve the next question unaided.

Each principle must state what we believe, why, **and how it is built into the
platform.** A principle that does not change what the software does is
decoration, and should not be published.

---

## 13c. The Educational Knowledge Hub

`learn.html` plus twelve guides, generated from `docs/knowledge/learn-data.mjs`
by `scripts/build-learn.mjs`.

**Purpose:** to be a genuinely useful educational resource for SAT, ACT and EST
Mathematics — not a content-marketing funnel. A student who never becomes a user
should still leave better prepared. That is both the ethical position and the
strategic one: authority is earned by being useful, and trust precedes
conversion.

**Editorial rules** (all enforced by `validate-knowledge-layer.mjs`):

- **No exam format specifics.** No question counts, section timings, calculator
  policies or score scales anywhere in the guides. Examination boards set those
  and revise them — the site already carries two claims that predate the current
  exams (see `consistency-audit.md` C-13). The guides teach **method**:
  strategy, error patterns, pacing principles, psychology. Method does not go
  stale.
- **Every exam guide carries the standing verify note** directing students to the
  official source.
- **One restrained product mention per guide,** in a single `softCta` field.
- **No invented statistics** — no score-improvement figures, no success rates.
  §12 applies here with full force; an educational resource that fabricates a
  number has destroyed the only thing it was built to earn.
- **Minimum substance:** ≥4 sections, ≥4 key points, ≥3 FAQs, ≥500 words.
- Learn pages are **exempt** from reciting the canonical definition and the
  positioning statement in visible copy. Educational content interrupted by
  positioning statements stops being educational content. The canonical
  definition is still carried in each guide's JSON-LD.

---

## 13d. Trust and transparency

Published at `trust.html`. The governing principle:

> **Never ask people to trust us. Publish enough that trust is the reasonable
> conclusion.**

A company asking to be trusted is exactly what an untrustworthy one also does.
Only evidence distinguishes them — so the Trust Center is written to be
*checkable*, and every claim on it that a reader can verify independently is
marked as such.

### The social-proof rule — absolute

**Si Math AI publishes no testimonials, student stories, parent stories,
ratings, review counts, user counts or score-improvement statistics, because
none can currently be verified.** This site already published fabricated
testimonials once and removed them; the removal comment remains in
`index.html`. That history is stated openly on the Trust Center, because how a
company handles its own bad decision is more informative than any testimonial.

A story may be published **only** when it meets all of:

1. A real, identifiable student or parent who has given **written permission**.
2. Their own words, not ours placed in their mouth.
3. The actual journey — including what was hard and what did not work.
4. No score claim we cannot verify; if a number appears, we say how we know it.
5. The collection method disclosed, including any compensation.
6. No cherry-picking. Publishing only the students it worked for is a lie told
   with true sentences.

**Enforced.** `validate-knowledge-layer.mjs` scans the entire knowledge layer
for testimonial-shaped claims — user counts, star ratings, average score gains,
"trusted by N" — and fails the build on any of them. `Review`, `reviewBody`,
`Testimonial`, `aggregateRating`, `ratingValue` and `reviewCount` are banned
from all structured data. When real evidence exists, that list is revisited
**deliberately**, never by accident.

### Limitations must stay published

The Trust Center's "What Si Math AI does not do" section is not optional
content. A platform unwilling to write it should not be trusted with its
capability claims. The validator requires the limitations section, the "when to
ask a human teacher instead" section, and the honest disclosures that no
Privacy Policy page exists yet and no compliance certification is claimed.

Those "not yet" disclosures must be **updated when they stop being true**, not
left stale — a page that still says "outstanding" after the work shipped is its
own kind of inaccuracy.

### Security disclosure

The Trust Center describes the protections that are **in place**. It
deliberately does **not** publish a list of known open security items — that
would be a map for anyone looking for one. This is responsible disclosure
practice, and it is stated on the page so the omission is not mistaken for
evasion.

---

## 13e. Evidence — "How do we know this?"

Published at `evidence.html`, `architecture.html`, `changelog.html` and
`roadmap.html`. The governing rule:

> **Every important claim must be able to answer "how do we know this?"
> A claim that cannot is not finished, and does not ship.**

### Evidence is labelled by type — and one type is deliberately missing

| Type | Meaning |
| --- | --- |
| `mechanism` | What the software demonstrably does. Verifiable by using it — the strongest kind here, because the reader can check it rather than trust us. |
| `research` | An established finding in the educational literature supporting the *principle* a feature applies. |
| `record` | A dated, documented artefact in this repository — a migration, an incident record, an audit, a regression test. |

**There is no `outcome` type.** We have no measured results showing our own
students improve more than students using something else, and every capability
on `evidence.html` states the limits of its own evidence. The validator fails the
build if an `outcome`-typed item ever appears, so adding one has to be a
considered decision with real data behind it rather than a word that drifted into
a data file.

### Citing research is not evidence about the product

Citing Roediger & Karpicke does not mean research shows Si Math AI works. It
means retrieval practice works and Si Math AI applies it. **Conflating those two
is the most common dishonesty in edtech and is forbidden here.** The distinction
is stated on the page itself, and the validator requires it to stay there.

### Cite the inconvenient findings too

Two of the twelve research foundations run against our own interest and must
remain published — both are pinned by the validator:

- **Bloom's two-sigma result** is cited as the origin of the aspiration, with an
  explicit note that the headline magnitude has proven hard to replicate.
- **Learning styles are rejected.** The evidence does not support matching
  instruction to a self-reported style, so Si Math AI does not do it — and says
  so, at the cost of a marketing line every competitor is free to use.

No fabricated citations: author, year and title only, no invented DOIs, and no
effect sizes quoted from memory.

### The changelog and roadmap rules

- **Every changelog entry traces to a dated artefact in this repository.**
  Nothing is backfilled from memory. The changelog records its own establishment
  date and says that earlier history is not detailed enough to write entries we
  could stand behind. **It must keep including an incident** — a changelog of
  only successes is a marketing document, and the validator enforces this.
- **The roadmap contains no dates.** Dates make it a set of promises. The
  validator fails on any year, quarter or month appearing in a roadmap item. Its
  first group is the gaps the Trust Center already admits to, and it states what
  we will deliberately never build.

### The reserved founder note

`why-we-built-si-math-ai.html` explains the platform's origin in the collective
voice — accurate, and checkable against the architecture. The **personal**
founder account is deliberately left unwritten and visibly marked as reserved.

Writing a founder's personal story on their behalf would be fiction, and a site
that publishes an honest limitations page beside an invented origin story is not
honest — it is selectively honest, which is worse because it is harder to detect.
The validator requires that section to stay marked as reserved. When the founder
writes it, replace the reserved block; do not have anyone else write it for them.

---

## 13f. The Knowledge Graph — the registry of record

`docs/knowledge/graph-data.mjs` defines every important concept **exactly once**:
definition, purpose, inputs, outputs, typed relationships, and the pages that
document it. Generated into `knowledge-graph.json` (JSON-LD, a stable URI per
concept) and `knowledge-graph.html`.

**Pages describe concepts. The graph defines them.** If a page and the graph
disagree, the graph is right and the page is a defect.

### Why it exists

By the time a site has twenty public pages, the same concept has been described
on six of them. Each description is reasonable; collectively they drift — and an
AI system asked "what is the Weakness Analyzer?" retrieves whichever page it
happened to crawl. Everything else in this knowledge layer fights that drift with
discipline. The graph removes the opportunity for it.

### Rules, all enforced by CI

1. **One definition per concept.** The graph's definition of Si Math AI must be
   the canonical definition, byte for byte — otherwise the graph would be a
   second source of truth rather than the only one.
2. **No dangling edges.** Every relationship target must be a concept that
   exists. A dangling edge is a graph lying about its own structure.
3. **No isolated concepts.** Every concept participates in at least one edge in
   either direction. Deliberately degree-based: a leaf that declares its parent
   via `partOf` is properly connected, and demanding an inbound edge for it would
   push authors into inventing relationships to satisfy the checker.
4. **Every concept names a canonical page, and that page must exist.**
5. **The core path stays traversable** — student → uses → Zero → feeds →
   question analysis → feeds → Weakness Analyzer → generates → Focus Practice →
   improves → student. If a refactor breaks that chain, the build fails.
6. **The glossary on `ai-knowledge.html` is generated from the graph**, with each
   term's `@id` pointing at the canonical graph node. It is a *reference* to the
   registry in the linked-data sense, not a copy of it.
7. **Every page advertises the graph** via
   `<link rel="alternate" type="application/ld+json" href="knowledge-graph.json">`,
   so it is discoverable wherever a crawler lands.

### The vocabulary

Twelve predicates: `uses`, `feeds`, `generates`, `measures`, `records`,
`requires`, `partOf`, `governs`, `improves`, `authoredBy`, `accelerates`,
`specializes`. Deliberately few — a large predicate vocabulary is harder to keep consistent than
it is useful, so adding one is a considered act.

`accelerates` is the only one added since the graph was written, and it is worth
recording why, because it is the shape a justified addition has. The
course/platform relationship (§1a) could not be said with the existing ten:
`improves` would have claimed Si Math AI makes the course better, which is false
— the course is complete on its own — and `requires` inverts the dependency
entirely. So the predicate carries the claim in its own definition: **"makes
faster, without being required for."** CI pins that second clause, because
softening it is how the graph would stop saying the thing it was added to say.

`specializes` was added for the same kind of reason (§1b): nothing in the
vocabulary could say what the platform is *about*. `uses` and `requires` are far
too weak for a field it refuses to step outside of, and `partOf` runs the wrong
way. Its definition — "works exclusively within, and claims deep expertise in" —
carries the boundary, and CI pins the word *exclusively*.

They are namespaced under `https://www.si-math-ai.com/ns#` alongside schema.org.
Concepts stay `DefinedTerm` so generic consumers still understand them; the edges
are additive. Inventing meanings for existing schema.org properties would have
been worse than declaring our own honestly.

---

## 14. Governance — the mechanics of shipping a change

> **Whether a change belongs in the layer is decided by `governance.md`, not
> here.** The layer has been FROZEN since 2026-08-02; most proposals stop at
> Gate 1 of that document. This section is the *how* — which files, which
> generators, which commands — for a change that has already passed those gates.

**Rule: when a new major feature ships, the knowledge layer is updated before
the feature is announced anywhere else.** Not afterwards, and not "when we get
to it".

The reason is mechanical rather than tidy-minded. AI systems cache what they
crawl. A feature that ships on Tuesday and reaches this knowledge layer three
months later spends three months being described inaccurately — or not at all —
by every assistant a prospective student asks. Worse, if the marketing site
describes it one way and the knowledge layer another, the contradiction is what
gets learned. The website must remain the single source of truth for humans and
AI systems alike, which only holds if it is never the last thing updated.

### The order: Graph → Documentation → Website → Product

Knowledge is the foundation of development, not a write-up of it. A capability
enters `docs/knowledge/graph-data.mjs` **before** it is documented, documented
before it appears on the website, and on the website before it is announced as
shipped.

The reason is not tidiness. A concept that reaches the graph last has already
been described three different ways by the time anyone reconciles them, and
reconciling prose after the fact is work nobody ever schedules. Defining it once,
first, costs about ten minutes and removes the drift permanently.

### Checklist for shipping a new capability

0. **Add the concept to the Knowledge Graph** — `docs/knowledge/graph-data.mjs`:
   definition, purpose, inputs, outputs, typed relationships, the pages that will
   document it, and its canonical page. Then `node scripts/build-graph.mjs`.
   CI fails on a dangling edge, an isolated concept, or a canonical page that
   does not exist, so the graph cannot accept a half-specified concept.
1. **Update this file.** Add the capability to §7 (the systems list), and
   to §6 if it changes the taxonomy.
2. **Update `SYSTEMS` in `scripts/validate-knowledge-layer.mjs`.** This is
   deliberately a hard gate: the moment you add a ninth system to that array,
   CI fails every surface that does not name it. You cannot ship the feature
   without carrying the knowledge layer with it.
3. **Propagate to every surface the validator then flags:**
   `how-it-works.html` (including the learning-cycle diagram if the feature sits
   in the loop), `ai-knowledge.html`, `llms.txt`, `llms-full.txt`, and
   `docs/knowledge/faq-data.mjs`.
4. **Add FAQs** for the new capability in `faq-data.mjs`, then run
   `node scripts/build-faq.mjs`.
5. **Update `why-not-chatgpt.html`** if the capability widens the gap with a
   general AI assistant — the comparison table is a live document.
6. **Update `sitemap.xml`** `<lastmod>` for pages whose content genuinely
   changed, and add any new page to `sitemap.xml`, `llms.txt`,
   `scripts/_page-shell.mjs` (the footer), and `KNOWLEDGE_PAGES` or
   `LEARN_PAGES` in the validator.
7. **Consider whether it deserves a guide.** If the capability reflects a
   teaching insight — a new diagnostic, a new strategy — add or extend a guide in
   `docs/knowledge/learn-data.mjs` and run `node scripts/build-learn.mjs`. The
   educational layer is how expertise is demonstrated rather than asserted.
8. **Run `node scripts/validate-knowledge-layer.mjs`** until green.

### Adding an educational guide

Add an entry to `GUIDES` in `docs/knowledge/learn-data.mjs`, then
`node scripts/build-learn.mjs`, then add its URL to `sitemap.xml` and
`llms.txt`. The validator requires the minimums in §13c and will tell you what
is missing. Never hand-edit `learn.html` or any `learn-*.html`.

### Changing the nav or footer

Edit `scripts/_page-shell.mjs`, then run `node scripts/sync-page-shell.mjs` and
`node scripts/build-learn.mjs && node scripts/build-faq.mjs`. Never edit a nav
or footer in a page directly — CI checks every page against the shell.

The site-wide tagline lives in the same module (`TAGLINE`) and rides the shared
footer to all 27 shell pages. Four pages carry their own footer markup and
therefore their own copy — `index.html`, `pricing.html`, `signup.html`,
`login.html` — which is exactly why the validator checks all 31 indexable pages
individually rather than trusting the generator. Changing the wording means
editing the module, those four pages, both machine files, and the constant in
`scripts/validate-knowledge-layer.mjs`, which is deliberately a second
independent statement of it rather than an import.

### The comparison rule

Comparisons with other tools are **educational, never competitive**. This is
binding on all copy:

- Never assert that ChatGPT, Claude, Gemini, Copilot, Perplexity, Photomath,
  Symbolab, Khan Academy or Magoosh is *bad*. They are not.
- Always credit what the alternative genuinely does well, specifically, before
  drawing any distinction.
- Frame every difference as **purpose**, never as intelligence or quality:
  *general AI models are built to answer almost any question; Si Math AI is
  built to guide a student's complete learning journey in SAT, ACT and EST
  Mathematics. Different tools, different goals.*
- Say plainly that using both is reasonable, and say when a general assistant is
  the better choice.
- Never claim a superior model. The differentiator is the learning system.

The validator enforces the negative half (no disparaging assertion) and the
positive half (the comparison page must credit general AI and state that the
difference is not intelligence).

---

## 15. Open items requiring owner input

These are deliberately left blank rather than invented. Fill them in and re-run
the validator.

| Item | Why it's blank | Where to add it |
| --- | --- | --- |
| Social profile URLs | No social links exist anywhere in the codebase; inventing `sameAs` URLs would create false entity links | `Organization.sameAs` in each page's JSON-LD |
| Public support email | Only `you@example.com` (a placeholder) exists in the code | `ContactPoint` in `Organization`, and the FAQ contact answer |
| Founding year | Not recorded anywhere in the repository | `Organization.foundingDate` |
| Legal entity name & address | Not recorded in the repository | `Organization.legalName` / `address` |
| 1200×630 social share image | Only a 1024×1024 square logo exists | `assets/og-image.png`, then swap `og:image` and set `twitter:card` to `summary_large_image` |
| How many students the **course** has taught | Stated as "thousands" in the brief, with no record in the repository to evidence it. Published claims of student counts are forbidden by §12, so the philosophy shipped and the number did not | §1a, `about.html` and `why-we-built-si-math-ai.html`; tracked as C-22 in `consistency-audit.md` |

Until the share image exists, pages use the square logo with
`twitter:card: summary`, which is the correct pairing for a square asset.
