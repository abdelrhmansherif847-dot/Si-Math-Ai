# The student exam surface — navigator, timer, calculator

Modules: `exam-chrome.js` (navigator + timer), `exam-calculator.js` (the provider
socket, Phase 4), `exam-workspace.js` (the calculator panel), `exam-graph.js`
(Zero Graph's evaluator), and two providers — `exam-graph-desmos.js` and
`exam-graph-zero.js`.
Preview: `scripts/build-exam-ui-preview.py`.
Verification: `scripts/check-exam-ui.cjs` (**82 checks, both themes**) for the
design surface, and `scripts/check-exam-calculator-wiring.cjs` (**40 checks**)
against the real `mock-exam.html`.

Built as reusable modules in the house pattern — root `*.js`, IIFE on
`globalThis`, no build step, no dependencies. `mock-exam.html` is frozen and was
not touched; the preview composes the shipped modules rather than reimplementing
them, which is the same rule `exam-stimulus.js` established.

## Navigator

*Question X of Y* is the control; the full grid sits under it, closed until
asked for. Four states, told apart by **shape as well as colour** so the grid
survives a colour-vision difference:

| state | treatment |
|---|---|
| current | filled, and **the only chip with a ring** — checked: no other chip has one |
| answered | filled, no ring |
| flagged | corner notch (`clip-path`), not colour alone |
| not seen | outline only |

Escape closes it. It never traps focus.

## Timer

Prominent by weight, not decoration — tabular mono at 19px. **Hideable**,
because for some students a visible countdown is what ends the exam early.

The hidden state is deliberate and reversible: the control stays on screen
reading *"Time hidden"* with a **Show** button, so the clock is never lost by
accident and never has to be hunted for. **The timer does not stop** — only its
face is covered, and a check proves it keeps advancing while hidden.

Low time is signalled by colour and border, **never by motion**: a pulsing clock
in peripheral vision is precisely the pressure the hide exists to relieve.

---

## The calculator — two providers on one socket

> **Rewritten 2026-08-27.** This section previously said a Desmos integration
> "cannot ship" without a signed partnership agreement, and concluded that a
> first-party tool was "the only version of the brief that can ship". **That
> conclusion rested on the wrong document** — the desmos.com *website* terms
> rather than the *API* terms. The API terms grant an embedding licence and a
> self-service paid route. The full record, with clause citations, is
> `docs/engineering/desmos-integration.md`. What follows is the position after
> reading the right document.

The exam offers **one tool with one job**: a *Graphing Calculator*, opened from
the top bar, mounted in a panel beside the question the student is still on. Who
supplies it is a configuration decision, not a design one.

`exam-calculator.js`'s provider socket — built in Phase 4 and empty ever since —
is where both live. Nothing new was invented for this; two providers were
registered into the socket that was waiting for them, and the panel that mounts
them is `exam-workspace.js`, a shipped module rather than preview markup — which
is what makes the failure path below shipped code too.

* **`exam-graph-desmos.js`** — the official Desmos API, v1.12, loaded from
  Desmos's own origin with our own key. Registered unconditionally, **inert
  without a key**. Four not-ready states, including one that refuses to serve the
  90-day evaluation trial to students — that is outside API Terms §2.a, and a
  policy document cannot refuse to mount. It is not hypothetical: the account
  currently holds a trial key, so that refusal is the live configuration's
  guardrail rather than a future one.
* **`exam-graph-zero.js`** — Zero Graph, first-party, always available. It plots
  through the exam's own figure renderer, so a student's sketch and the
  question's figure obey one grammar. Its evaluator is shunting-yard to RPN,
  **not `eval`**: this parses keystrokes in a page holding exam state, and
  errors are written for a student mid-exam — *"sin( needs something inside
  it"* — not for a developer.

**Neither is offered to any student today.** `isInAppAvailable()` also requires
the exam's own policy to name a provider, and every exam in `exam-registry.js`
has `provider: null`. Registration is not availability, and that separation is
deliberate: DSAT, ACT online, ACT paper and EST I have four different test-day
realities, so naming a provider is a per-exam decision.

### What the abstraction has to guarantee, and how it is checked

The point of a provider socket is that **the exam UI cannot tell which provider
it is showing.** That is a claim about pixels, so it is measured:

* the panel, header and mount rectangles are compared across all three provider
  states and are identical to the pixel;
* the header's markup is diffed between states, minus the one subtitle line
  meant to differ;
* **Zero is counted in our header and counted inside the provider's region** —
  one and zero, in every state.

That last one is not decoration. API Terms §5.b(iii) forbids removing, altering
or obscuring Desmos's branding on the calculator, and the user's brief said the
same thing independently. Zero belongs to **our** chrome — the launcher and the
workspace header above the rule. Below the rule, the provider owns the space.

Two of these checks were red before they were green: a ready provider's longer
subtitle wrapped and grew the header, moving the calculator region 19px; and the
mount region was auto-height, which would have mounted a Desmos calculator into
a container with no height.

### One name, and no claim of a relationship

The tool is called **Graphing Calculator**. Not "Zero × Desmos" — that asserts a
partnership that does not exist, and API Terms §6.b forbids combination marks
with theirs outright. The provider's name appears beneath the title when one is
licensed, which is what §6.b's trademark licence is *for*: identifying the tool
inside the product. It appears in no marketing copy anywhere. A check sweeps the
rendered text and every `alt`, `aria-label` and `title` for partnership language.

### When it fails mid-exam

The provider gets 12 seconds, then the workspace says *"The calculator did not
open"* in the student's language, on a neutral surface with one red edge rule —
not a red wash, which is the wrong volume for someone with a clock running.

Zero Graph is then **offered as a button**, under a line saying plainly that it
is not the same calculator. It never switches on its own. A student who reached
for a graphing calculator and was quietly handed a different one has been misled
at the worst possible moment, and the exam's record would say they used a tool
they did not choose. The check asserts the offer appears, that the active
provider is *still* the failed one until a click, and that one click switches it.

### Zero's artwork — a correction, and the resolution

**I said twice that this repository has no Zero image asset. It does.** A
360×360 PNG of the mentor dragon — blue, bearded, spectacles, robe, staff — is
inlined in `chat.html` as a `data:` URI on the halo element. I searched for image
*files* and for `src="…zero…"`, and a base64 data URI matches neither. The
40×40 `DRAGON_MENTOR` constant in the same file is a second, smaller copy.

So the earlier note here — that the site draws Zero as a glyph and no asset
exists — was wrong on the second half, and it led the exam to use the emoji when
the real artwork was available all along.

**Resolved 2026-08-29.** The 360×360 bytes are extracted verbatim to
`assets/zero-mentor.png` — the same asset, in a file, so the exam surface can use
it without carrying a second 32KB copy of base64. `chat.html` is untouched.
Nothing new was drawn: the hand-made vector attempt (`zero-mark.js`) was deleted
for reading as a seahorse, and that decision stands.

`scripts/check-exam-calculator-wiring.cjs` asserts the header's image is that
file, so a future edit cannot quietly go back to a glyph.

### Why in-panel, and not a second tab

`exam-integrity.js` records the exam tab being hidden or losing focus as an
integrity event, with durations. Sending a student to a second tab would fire an
integrity event on every legitimate use of a permitted tool. In-panel is the
only model compatible with the integrity layer that already ships.

### Where the calculator connects to the exam system

Recorded 2026-08-29, after inspecting what the DSAT mock exam actually is.

**`mock-exam.html` delivers no questions.** Its views are SELECT → TIMER →
TRANSITION → RESULTS → MISTAKES → SAVING → SUCCESS, and none of them renders an
item: no question renderer is loaded, and `exam-stimulus.js` is still marked
DRAFT — NOT WIRED. Students sit the exam elsewhere — on paper, or in Bluebook —
and use this page to time themselves, cross module boundaries, and log afterwards
the questions they got wrong.

So "put the calculator inside the exam" can only mean what it already means: the
calculator is available **on the screen the student is on while the clock runs**,
which is the TIMER view. That is where the slot is, and that is the whole of the
integration surface until the Question Spine delivers items.

**The connection point is one field.** `exam-registry.js` gives every exam a
`calculator` descriptor whose `provider` names the in-app calculator that exam
offers. `isInAppAvailable(code)` is true only when the policy names a provider
**and** that provider is registered. Every exam is `provider: null`, so:

```
provider: null  →  provider: 'desmos'   on SAT_MODULE_1 / SAT_MODULE_2 / SAT_FULL
```

is the entire integration for the DSAT mock exam, and the same one line is how
every future maths exam opts in. Nothing is duplicated per exam — the launcher,
the workspace, the provider socket and the Desmos provider are shared modules the
page already loads.

That line is deliberately not written yet.
`scripts/validate-desmos-activation.mjs` fails the build if any exam names a
provider while either `desmos-activation: PROVEN` or `desmos-commercial:
APPROVED` is missing. The integration is finished; the gate in front of it is the
point.

**Per-module policy is NOT built, on purpose.** `exam-calculator.js` describes a
`partial` scope for exams that permit a calculator in one section only, and the
timer now has a real module model (`modulePlan`, `moduleOrdinal`). But no exam in
the registry carries `scope: 'partial'` — EST Math 1's note describes part-2-only
while its scope says `exam` — so building the gating would be machinery for a
policy that does not exist. It waits for an exam that needs it.

**One defect found and fixed while inspecting.** The panel is appended to
`<body>` so it survives the page re-rendering its views — which is also why
nothing was tearing it down. Opening the calculator during the timer and then
ending the exam left the student on the Results screen with the panel and its
scrim still over it. Reproduced in a browser, then fixed with the rule the
calculator should always have had: when no slot is on the page, the exam screen
is gone and the calculator goes with it. A module boundary is the same shape, so
it closes there too and returns with the next module.

## Quiet during the question

Checked, not asserted: **nothing in the top bar or the question card animates**,
the page never scrolls sideways, and every text colour clears 4.5:1 on the exam
surface in both themes. The tools are one click away and none of them competes
with the mathematics.

---

## The delivery surface — `exams.html`

**Built 2026-08-29.** The question-based exam: real items and figures read from
the Question Spine, MCQ and grid-in answers, module timing, adaptive routing and
marking. `mock-exam.html` is untouched and stays what it is — the timer a
student runs alongside a paper or Bluebook exam, which delivers no questions.

### What is reused, and what is new

| | |
|---|---|
| **Reused, unchanged** | `exam-stimulus.js` (figures, from `spec.frame`/`figures[]` + `question.reading`) · `exam-chrome.js` (navigator, hideable timer) · `exam-calculator.js` + `exam-workspace.js` + `exam-calculator-config.js` + `exam-calculator-launcher.js` + the three providers · `exam-registry.js` · `preflight-exam-form.mjs` |
| **New — the flow** | `exam-delivery.js`, a state machine with no DOM and no network |
| **New — the data** | `exam-form-source.js`, the only thing that reads the Spine |
| **New — the look** | `exam-surface.css`, the first shipped home for the `.sx-*` and `.xc-*` languages |
| **New — the page** | `exams.html`: auth gate, screens, composition. No exam logic. |

`exam-surface.css` closed a second two-copies problem. Both renderers say in
their headers that they set no colours — which is what lets one grammar serve
light, dark, exam and review — and until now every `.sx-*` rule in the
repository lived inside a preview **builder**, eight of them, nine to
twenty-nine rules each. A shipped page growing a ninth copy would have been the
worst one. `scripts/validate-exam-surface-css.mjs` now fails if the renderers
emit a class the sheet does not dress; the exploration builders keep their own
treatments, which is what they are for.

### Generic by construction

Nothing in `exam-delivery.js` or `exams.html` names DSAT. The engine reads
sections in ordinal order, handles any number of them, and treats a variant-
bearing ordinal as one stage with options. A second form needs no second page.

### Two things it refuses to do

**No routing threshold.** `exam-registry.js` records routing as adaptive-READY
and inert, because no cut score has been set: *"naming a path would imply a
measurement we are not making."* So the engine takes a `route` callback and
never a default, and a session with no route says `routeChosen: false` rather
than pretending. On the review surface the reviewer chooses, from a control
labelled as review-only — a form with two Module 2 variants cannot be reviewed
by sitting one of them.

**No score on the break screen.** The state machine returns an empty `results`
array in any phase but `DONE`, so the screen could not print a score if it
tried. A student learns neither their Module 1 score nor which Module 2 they
were given; a break screen that revealed either would teach them to read their
own routing, which is a different exam from the one being simulated. The module
is named by its `label` throughout — never by `variantId`.

### The calculator, at the section level

`exams.html` emits one empty `[data-si-calculator-slot]` and nothing else. Two
independent gates decide whether anything appears in it:

```
exam_form_sections.calculator_allowed   the SECTION's policy — no slot at all when false
exam-registry.js  calculator.provider   WHICH tool — null on every exam today
```

Both are needed. Both DSAT sections allow one, so the slot is emitted on every
module of `DSAT-2026-A` — and stays empty, because no exam names a provider and
`scripts/validate-desmos-activation.mjs` still refuses to let one be named until
the render is proven and Desmos confirms commercial use. Nothing on this page
can widen that; it contributes a slot, not a decision.

### Why it is admin-only, and what would change that

All four Spine tables are RLS-gated to `has_role_at_least('admin')`, so a
signed-in student reaching this URL sees an empty library rather than an exam —
measured, not assumed: `dsat-form-a-import.md` §5. That is the right posture for
a surface whose job today is reviewing a DRAFT form on the real stored rows.

Making it student-facing is **not** a change to this page. It is a separately
approved, published-only read model that excludes `correct_answer` — the M3
migration says so on the column itself. `exam-form-source.js` already takes
`withAnswers: false` and returns the same form without the key, so the seam is
real rather than promised.

### What the browser check proves, and what it does not

`scripts/check-exams-page.cjs` drives the page over the production CSP against
an export of the actual Spine rows: 24 checks, including that every one of the
44 questions sat is **visible on screen** (computed colour against computed
background — the white-on-white defect that passed a DOM check in the first
preview), that all nine Module 1 figures draw, that the navigator's four states
are each reached, and that the break screen carries no score-shaped number and
no variant name.

It stubs the Supabase client, so it checks the page and not the network: the
auth and RLS path is exercised by a person opening the page signed in. And this
sandbox has no route to `cdn.jsdelivr.net` — the gateway answers 403 to CONNECT
— so KaTeX does not load and `$maths$` stays literal in that run. The check says
so in its own output rather than leaving it to be discovered.

### A defect it caught immediately

The first question ever rendered from the production Spine — a plane plot whose
triangle starts at the origin, labelled O, A, B — drew **two** letter O's a few
pixels apart: one from the author's vertex labels and one from the renderer's
automatic origin label, which exists because most geometry stems name the
origin. "Triangle OAB" stopped saying which O it meant. Fixed in the shared
renderer (the author's label wins), covered by a test in both directions, and
found by looking at the pixels — which is the rule
`student-facing-rendering-validation.md` §6 exists to state.

### The calculator inside the running exam

**Wired 2026-08-29.** `exams.html` emits the slot per section and the existing
launcher fills it. No second implementation, no second provider path, no change
to `mock-exam.html`. Driving the flow found four things, and all four were
defects rather than adjustments.

**The panel was modal, and a modal panel is wrong here.** Its scrim swallowed
every click on the exam, so a student could not read the stem, pick an option or
type a grid-in answer with the calculator open — which is most of what a
calculator is for. Found by trying to press Next with it open and being unable
to. On `mock-exam.html` a scrim costs nothing, because there is nothing behind
the panel but a clock. So `Workspace` gained `modal` (default true, unchanged
for `mock-exam.html`), the slot carries `data-si-calculator-modal="false"`, and
the panel already said `aria-modal="false"` — the scrim had been telling
assistive technology one thing and the pointer another.

**The mount region contained nothing.** `.xw-mount` had `overflow:hidden` and no
`position`, so anything the provider positions absolutely — a keypad overlay, a
settings menu, an error toast — resolved against the fixed panel and landed on
top of our header, including the Close button. That is the one control a student
needs when the thing covering it has gone wrong. One property, in the launcher's
own CSS.

**It mounted twice on every open after the first.** The config loader caches a
success, so from the second open the panel rendered once from `open()` with the
key already in hand and again from the config callback. With the real provider
that is a calculator constructed, torn down and constructed again on every open.
The callback now re-renders only when the config actually arrived late.

**The clock could be pushed off the bar.** Making room for the panel narrowed
the shell and left the bar to cope: the launcher ended up half under the panel it
had just opened, and the timer went off the end. A clock that disappears when a
student opens a calculator is the worst thing on this page to lose. The bar now
has an explicit priority — navigator and timer survive; the module note and the
launcher give way, the launcher because the panel is on screen with its own
Close. And the shell's padding does not animate: `exam-chrome.js` states the
rule, nothing moves while a student is reading.

**The slot is tied to the section, not the question.** It was first rebuilt on
every render — forty-four times a module, under an open panel. It is now created
once per section and left alone, which is also what makes the panel close at a
module boundary: no slot, no calculator.

**Zero Graph is a fallback here, and only here.** The launcher used to pass
`fallbackId: null` with a note saying to pass it once the figure renderer
shipped. It has shipped, and `exams.html` loads it, so the launcher now asks
rather than assumes: `zero-graph` where `SiExamStimulus.renderForQuestion`
exists, `null` where it does not.

**The gates are untouched.** `scripts/check-exams-calculator-flow.cjs` drives 26
checks against a Desmos-SHAPED STUB — not Desmos, and passing it proves nothing
about Desmos — using `?desmos-check=1`, the verification affordance that labels
the control TEST on screen. `desmos-activation` is still UNPROVEN and
`desmos-commercial` still PENDING, no exam names a provider, and nothing on this
page can change that.

### How you reach it

**Fixed 2026-08-29, after the page was built and shipped unreachable.** Three
things stood between the owner and the exam, and none of them was Desmos or the
form's draft status:

1. **Nothing linked to `exams.html`.** Not one anchor anywhere on the site. The
   page existed, worked, and could be opened only by typing its URL.
2. **It is not on `main`.** Root `*.html` deploys to production on merge, so
   until this branch merges the page exists on Preview deployments only.
3. **It had no way out.** No sidebar — deliberately, because site chrome beside
   a question is noise — but also no exit, which makes a page a trap.

What was NOT the problem, both measured rather than assumed:

* **RLS.** Acting as the owner's actual account through the policies:
  1 form, 3 sections, 66 questions, 24 stimuli, all visible. The data path was
  never the obstacle.
* **`status = 'draft'`.** Draft is readable by an admin; it is *publication*
  that gates students. Reviewing a draft is what the state is for.

The link belongs in `nav.js` and nowhere else — that file says so in its own
header, because `render()` overwrites the slot and "a static one looks correct in
the source and does not exist in the browser." It sits in the **Admin** section
at `admin`+, the same threshold the four Spine tables enforce: a link shown below
it would lead to a page listing nothing. `tests/admin-nav.test.mjs` runs the real
`render()` and asserts that threshold against Support Queue's, so the two cannot
drift apart in silence.

`exams.html` gained a quiet `← Dashboard` on the bar, hidden while a module is
running: an exam is not a screen to wander off a link from, and the browser's own
Back still works for a reviewer who means it.

### Visual fidelity — the grammar, not an approximation of it

**Corrected 2026-08-29, after review.** The exam drew every figure successfully
and drew several of them *wrong*, because `exam-surface.css` was built from the
wrong source.

**Where the approved styling lives.** `scripts/build-figure-system.py` — the
artefact of `365d85b`, *"Close the figure families as a grammar, not five
looks"*, which decided all five: **data** Screen-native, **tables** Boxed with a
header band, **number lines** Statement, **geometry** Squared paper, **function
graphs** Open with a grid only when the question asks for a value. It has its
own 96-check gate, `check-figure-system.cjs`.

**Why it was lost.** `exam-surface.css` was extracted from the exam-UI preview,
which only ever showed ONE function graph. Everything that preview did not
exercise was written here from scratch: the data family had no hue at all, the
table was a plain underlined list instead of a boxed one with a header band, a
named point was set in DM Sans semibold instead of the mathematics face, and
every number-line weight was a little off. Fifteen properties across four
families.

**Why nothing caught it.** `validate-exam-surface-css.mjs` asks whether every
class has *a* rule. It cannot ask whether it is the *right* rule. Coverage is
not fidelity, and a check that cannot tell the difference will pass an invented
stylesheet forever.

**One structural gap had to be closed first.** The grammar spends colour on the
data family via `#v-data-0 .sx-series` — a selector for where a figure sat on
*that page*. Nothing like it exists in an exam, where the family is a property of
the row. So the renderer now stamps `sx-fam-plane|graph|data` from the frame it
was given, verbatim, and the rule can be about the figure instead of the layout.

**The consolidation.** Both preview builders now read `exam-surface.css` at build
time instead of carrying their own copies. So the approved-grammar page renders
from the shipped stylesheet, and its 96 checks — plus the exam surface's 82 —
test what students get. One system, three surfaces.

**The comparison, as a check.** `scripts/check-exam-figure-fidelity.cjs` reads
the same computed properties from the real exam (on the production rows) and
from the approved grammar's page, and fails on any difference. Run against the
stylesheet shipped the day before, it reports all fifteen; it passes now.

**One rule from the specimen is deliberately not carried**: `width:1%` on the
table's first column. It is meaningful only under the specimen page's own
`table{width:100%}`, and inside an exam card the pair produced a 702px table
with a 41px label column and a 660px column of two-digit numbers. Every decided
property is kept; only the part that was about the other page's width is not.

**A pre-existing red check surfaced.** `check-exam-ui.cjs` strips the panel
subtitle before comparing chrome across providers, with `[^<]*` — which stopped
matching the day the subtitle gained a `<b>` around the provider's name. It had
been reporting a difference that was only ever the line it is meant to ignore,
and I had not re-run it after that change. Fixed; 82/82.

**Observed, not changed**: on the two-series bar chart the direct labels sit
close together at exam width. Direct labels over a legend is the approved
decision (`4e227e8`) and this is a real-data crowding case, not a styling
defect — recorded here rather than quietly redesigned.

### "Open" is a rule about the drawing, not only about the CSS

**Corrected 2026-08-29, on review of Question 4.** The figure carried the
grammar's exact grid styling and still drew a plated, boxed graph. Measured
against the grammar's own function/value variant:

| | grammar `v-fn-1` | exam Q4, before |
|---|---|---|
| gridlines on the window's edges | **1** (top only) | **4** — all round |
| y-axis on the left boundary | no | **yes**, doubling it |

Same CSS, same grid density, opposite treatment. The cause was in the geometry,
not the stylesheet: the renderer ruled every step inside the window **including
the window's own edges**, so any declared range that happens to land on steps
produces four outermost lines forming a rectangle. Q4's ranges — x ∈ [0,5],
y ∈ [−1,5], step 1 — land on all four.

**The correction, from the decision rather than from taste.** For the `graph`
family the grid rules the *interior only*: a line on the boundary is a frame,
and a frame is the plated look this family is defined against. The grid stays —
Q4's `reading` is `value`, so the question does need one — but it supports the
curve instead of enclosing it.

**And the plane still draws to its edges**, because squared paper is a full
sheet and the grammar's geometry variant does exactly that. Both halves are
asserted, and both mutations go red: making the graph close again fails, and
making the plane open fails harder.

The grammar's own 96-check gate still passes, so the change is consistent with
every property that decision was checked for. Its function variant loses one
boundary line, which is the direction "Open" names.

**A note on `reading`.** Q4 asks *"for how many values of x does f(x) = 2?"* —
a counting question, which sits at the boundary of shape and value, and the
authored decision is `value`. It is defensible (you must locate y = 2 to count
crossings) and it is **content**, so it is recorded here for the author rather
than changed. All twelve authored readings were reviewed against their prompts;
this is the only one at the boundary.

**Verified per family on the real surface.**
`scripts/check-exam-figure-fidelity.cjs` now walks one real question of each
family in `exams.html` and asserts the decision, not just the styling:

```
function graph · Open — the drawing does not close                [Q4]
function graph · the grid is there, because the question asks     [Q4]
coordinate geometry · Squared paper — rules to its edges          [Q16]
data · Screen-native — rules ACROSS ONLY, and no arrowheads       [Q14]
number line · Statement — open and closed endpoints both drawn    [Q17]
table · Boxed — the renderer's table, not an SVG                  [Q12]
```

That distinction is the lesson: the property comparison proves the exam uses the
approved **styles**, and could not have caught Q4. "Has a grid" and "is
enclosed" are different questions, and only the second one was wrong.
