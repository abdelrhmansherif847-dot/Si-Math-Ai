# The student exam surface — navigator, timer, Zero Graph

Modules: `exam-chrome.js` (navigator + timer), `exam-graph.js` (the workspace).
Preview: `scripts/build-exam-ui-preview.py`.
Verification: `scripts/check-exam-ui.cjs` — **62 checks, both themes**.

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

## Zero Graph — and why it is not Desmos

The brief asked for a Desmos workspace co-branded as "Zero × Desmos". **That
cannot ship**, and the block is already recorded in this repository — I did not
discover it, I found it in our own code.

`exam-calculator.js` says so in its header, and
`docs/roadmap/mock-exam-v2-investigation.md` §7 quotes the Desmos Terms of
Service verbatim:

> "You agree to use the Desmos Tools only (a) as an end user, for your personal,
> non-commercial use or (b) as a School, for academic use by you and your
> Students in individual classes."
>
> "You may not frame or mirror the Desmos Tools without our prior consent."
>
> "Desmos does, pursuant to a separate written agreement, permit certain third
> parties to integrate with the Desmos Tools for commercial use."

Si Math AI sells subscriptions in EGP and runs a credit economy. It is neither
an end user acting non-commercially nor a School. Both routes are closed without
a signed agreement: iframing is explicitly prohibited, and the JS API key is
issued **under** that agreement. This is a business action — an email to
partnerships@desmos.com — and no amount of engineering removes it.

**Co-branding is a second, independent problem.** "Zero × Desmos" asserts a
partnership that does not exist. That is a trademark question rather than a
terms-of-service one, and it does not become true by being well designed. It
would be a stronger claim than embedding, not a softer one.

### So the tool is first-party

That is not a consolation prize. It is the only version of the brief that can
ship — and the only one that can honestly read as **one merged tool**, because
we own both halves. A first-party tool needs no permission to carry Zero's name.

* **One name, one mark.** *Zero Graph*. Not two logos side by side.
* **The mascot is the established Zero** — the dragon already used in chat and
  on the dashboard, not a new character invented for this surface. It **perches
  on the graph plate and overlaps it**, so the two read as one object. A check
  measures the overlap rather than trusting the CSS.
* **It plots through the exam's own renderer.** A student's sketch and the
  question's figure are drawn by the same code under the same grammar, so they
  look like one product instead of two.
* **A safe evaluator, not `eval`.** Shunting-yard to RPN. This parses a
  student's keystrokes in a page that also holds exam state; handing those to a
  JS compiler is not a risk worth fifty saved lines. Errors are written for a
  student mid-exam — *"sin( needs something inside it"* — not for a developer.

`exam-calculator.js`'s provider socket is **untouched**. If the Desmos agreement
is ever signed, Desmos registers there and Zero Graph becomes the unlicensed
fallback rather than something to unpick.

## Quiet during the question

Checked, not asserted: **nothing in the top bar or the question card animates**,
the page never scrolls sideways, and every text colour clears 4.5:1 on the exam
surface in both themes. The tools are one click away and none of them competes
with the mathematics.
