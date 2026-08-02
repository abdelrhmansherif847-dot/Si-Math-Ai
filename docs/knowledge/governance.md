# Knowledge Layer Governance

**Status: FROZEN — 2026-08-02.**

The Si Math AI Knowledge Layer is closed. It is now a **stable public
specification of the platform**, not a document that grows.

This file decides *whether* a change belongs. `knowledge-base.md` §14 records
*how* to make one — which files, which generators, which commands. Read this one
first; most proposals stop here.

It is an internal governance record, not a public page. It is not in
`sitemap.xml`, carries no structured data, and describes the process rather than
the product — which is exactly why the freeze it defines does not apply to it.

---

## 0. Why this document exists

An audit on 2026-08-02 tested twenty-two questions an AI system would need
answered against every published surface, and swept for entities named in prose
but missing from the graph. **Twenty-two of twenty-two were answerable. No
entities were missing. One genuine ambiguity was found and fixed**
(`consistency-audit.md` C-31).

The layer had reached diminishing returns. Further documentation would restate
rather than add — and a knowledge layer that keeps growing past that point does
active harm: it dilutes the pages that matter and gives retrieval systems more
surface to be inconsistent across.

So it is frozen deliberately, at a point chosen by evidence rather than by
exhaustion.

---

## 1. The one rule

> **Documentation follows the product. Never the reverse.**

```
Product change → Knowledge Graph → Documentation → Website → Structured Data → LLM files
```

Every change to the layer must be traceable to something that happened outside
the layer: a feature shipped, real data arrived, or the layer was shown to be
wrong. **A documentation idea is not an origin.** "This page could be clearer"
and "we should have a page about X" are, on their own, reasons to do nothing.

The direction matters because the failure it prevents is invisible while it is
happening. Documentation written ahead of the product describes intentions;
retrieval systems cache it as fact, and the gap between what the site says and
what the software does becomes the thing AI systems have learned.

---

## 2. What belongs in the Knowledge Layer

Five things, and nothing else.

| Belongs | Because |
| --- | --- |
| **Entity definitions** — what a thing is, exactly once, in `graph-data.mjs` | The graph is the registry of record. A concept defined in prose but not in the graph will be described three ways within a year. |
| **Canonical statements** — the sentences the site wants reproduced verbatim | Retrieval systems reproduce what several sources state identically and paraphrase what they state differently. |
| **Relationships between entities** — typed, in the graph | An unstated relationship is one a reader infers, and inference is where wrong answers come from. |
| **Published boundaries** — what the platform does *not* do, cover, or have | A claim of depth is only credible with an exclusion list attached. These are the most valuable statements on the site and the first a future edit will want to delete. |
| **Evidence, labelled by type** | An unlabelled mixture of mechanism, research and record reads as rigour and is not. |

Everything on this list shares a property: **it changes what an AI system
concludes.** That is the test.

---

## 3. What does not belong

| Does not belong | Why it is refused |
| --- | --- |
| **Repetition for SEO** | Saying the same thing on a sixth page does not strengthen it. Past a small number of consistent sources, additional restatement dilutes. |
| **Marketing copy dressed as documentation** | If a paragraph would be at home in an advertisement, it is advertising. The layer's authority comes from restraint. |
| **New pages that restate existing pages** | Ten of eleven pages requested in one brief already existed under different names (C-30). The gap was the index, not the content. |
| **Claims without evidence** | Student counts, score gains, ratings, outcome claims. `FABRICATED_PROOF` fails the build on these, and the check has caught real copy twice. |
| **Features that do not exist** | Publishing one contradicts the Trust Center on the same site — worse than either statement alone. See C-30, where two requested features were published as *absences* instead. |
| **Internal engineering records** | Roadmaps, incident analyses, migration strategies. Those live in `docs/roadmap/` and `docs/engineering/` and are written continuously. |
| **Rewording that says the same thing more nicely** | The single most common proposal, and the one this freeze exists to refuse. |

---

## 4. When documentation *must* be updated

Four origins. Each is a real event outside the layer.

**1 · A feature shipped.**
Follow the checklist in `knowledge-base.md` §14. The graph goes first — CI
rejects a half-specified concept, so it cannot accept one. Adding a system to
`SYSTEMS` in the validator deliberately fails every surface that does not yet
name it: you cannot ship the feature without carrying the layer with it.

**2 · Real data arrived.**
The addition that is always welcome, and the one the whole layer was built to
make possible. `knowledge-base.md` §0a is the runbook. Note that publishing
outcome evidence is a *two-sided* change: the pages currently state that none
exists, and the validator requires that statement.

**3 · The layer says something wrong.**
The freeze forbids adding, never correcting — otherwise it preserves errors.
Correction is always in scope and needs no further justification.

**4 · A real ambiguity exists.**
Not a hypothetical one. The standard is C-31: a specific wrong inference an AI
system could reasonably draw from what is currently published, demonstrated
rather than imagined. Fixing one is in scope; hunting for more is not — the audit
that found the last one is complete.

---

## 5. When it must deliberately remain unchanged

This is the harder half, and the reason the freeze is written down.

- **When the product has not changed.** However good the writing idea is.
- **When the change is a nicer phrasing of an existing claim.** Canonical
  sentences are pinned verbatim by CI precisely so they cannot be improved into
  drift. Rewording one is a change to the specification, not an edit.
- **When it would fill a published gap with something unverified.** The two
  uncited methodology components, the missing student headcount, the absent
  outcome evidence — each gap is *shown* rather than filled, and that is the
  feature. Filling one with a loosely-related citation is the exact conflation
  `evidence.html` warns about.
- **When the claim cannot be CI-checked.** An unenforced claim decays silently.
  If a proposed statement cannot be pinned, that is evidence it is too vague to
  publish.
- **When it is being added because a competitor has one.** The specialization is
  the strongest claim the platform has, and every broadening weakens it.

> **A layer that only ever grows has no standard. Refusing a good-sounding
> addition is what the freeze is for.**

---

## 6. The review process

Any proposed change runs four gates, in order. Failing one stops the proposal —
there is no appeal to enthusiasm.

**Gate 1 · Origin.**
Which of the four events in §4 caused this? If the honest answer is "a
documentation idea", stop. Record the proposal in `docs/roadmap/` if it depends
on future product work; do not write it into the layer.

**Gate 2 · Novelty.**
Search the layer first — pages, `llms-full.txt`, `graph-data.mjs`. Does it say
something not already said? If a concept exists in two places, **consolidate;
never add a third**. C-30 is the cautionary case: most of what a brief asked for
already existed under different names.

**Gate 3 · Placement.**
Can an existing page hold it? Improving a page beats creating one, every time.
A new page must introduce genuinely new knowledge *and* justify why no existing
page is its home. The public page count has not risen since 2026-08-01, and the
default answer is that it should not.

**Gate 4 · Enforcement.**
How will CI check it? Every canonical claim is pinned, and every new check must
be verified against a **planted violation** — a check that cannot go red is not
evidence, it is decoration. This standard has caught defects in the layer *and*
in the checks themselves (C-25, C-27, C-28, C-30).

Then the mechanics: `knowledge-base.md` §14, and record the finding in
`consistency-audit.md` with the next C-number.

### Who decides

Gates 1–3 are the owner's call — they are product questions wearing documentation
clothes. Gate 4 is an engineering obligation and is not optional.

---

## 7. The feature gate

Before any feature is built, three questions. Not for documentation — for the
product itself.

> 1. **Does this improve learning?**
> 2. **Does this improve understanding?**
> 3. **Does this improve long-term retention?**

**If the answer to any of them is "no", the feature should not exist** — however
impressive the technology, and however well it would demo.

This is deliberately stricter than the older single question ("will this
genuinely help students learn better?"), which a sufficiently motivated advocate
can answer yes to about almost anything. Three specific questions are harder to
talk past, and the third is the one most features fail: a great deal of
educational software improves performance during the session and nothing
afterwards.

**The educational methodology remains the primary product. The software remains
its delivery system.** A feature that improves the software without improving the
methodology is not an improvement to Si Math AI.

---

## 8. What the remaining work actually is

None of it is documentation.

1. **Build the product.**
2. **Collect real educational evidence.**
3. **Measure student outcomes.**
4. **Gather genuine parent and student stories, with written permission**
   (`knowledge-base.md` §13d sets the standard; the section on `trust.html` is
   deliberately empty until then).
5. **Continuously improve the educational methodology itself.**

Three items are open in `consistency-audit.md` and each needs the owner rather
than a writer: **C-13** (verify the SAT and ACT format claims — the only open
item that could mislead a student), **C-22** (a verifiable figure for the
course), and **C-3 / C-4** (the Elite tier copy, the Founder count in the
database).

The largest sits outside that list. The Evidence Center is built to receive real
outcomes, `EVIDENCE_TYPES` is one word short on purpose, and §0a is the runbook.
Until that data exists the honest position is the one already published: **the
platform has no outcome evidence of its own.** That single addition would improve
this layer more than every page written since it began.

---

## 9. Unfreezing

The freeze ends for one reason: **the product evolved.** Then §4 applies, the
change flows in the direction §1 requires, and the layer is frozen again at the
new baseline.

It does not end because time has passed, because a competitor published
something, or because the layer could be larger. It is not a moratorium waiting
to expire. It is the normal state of a specification that is finished and
correct.

---

**Baseline at freeze:** 22 public knowledge pages (31 indexable URLs) · 34 graph
concepts · 116 typed edges · 3,107 CI checks · 31 findings recorded in
`consistency-audit.md`, 28 resolved and 3 awaiting the owner.
