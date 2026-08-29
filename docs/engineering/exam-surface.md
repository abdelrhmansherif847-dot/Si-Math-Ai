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
