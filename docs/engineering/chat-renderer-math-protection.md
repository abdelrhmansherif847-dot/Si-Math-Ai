# Why some Zero answers rendered as raw Markdown

**Fixed 2026-08-06.** Intermittent: most answers rendered perfectly, some came
out with literal `\( … \)`, raw `**Strategy**`, a visible `▯M0▯`, and patches of
red — in the same session, through the same renderer.

## Root cause

`renderMarkdown` protects LaTeX before escaping, by replacing each math span
with a `\x01M<n>\x01` placeholder and restoring it after the Markdown pass. It
did that in **four sequential regex passes**:

```
$$...$$   1st   [\s\S]*?   spans lines
\[...\]   2nd   [\s\S]*?   spans lines
$...$     3rd   [^$\n]+?   single line
\(...\)   4th   [\s\S]*?   spans lines
```

Two defects follow from that shape, and between them they produce every symptom.

**1 · A later pass could match across an earlier pass's placeholder.** `\(…\)`
is processed last, so `\( the term $$a+b$$ matters \)` stores `$$a+b$$` as `M0`
first, then stores the *whole* `\(…\)` span — placeholder included — as `M1`.
`restoreMath` was a single `String.replace`, and replacement text is never
rescanned, so the nested `\x01M0\x01` reached the DOM verbatim. `▯` is how a
font draws U+0001. Strictly lower-triangular, by save order:

| outer | can swallow |
| --- | --- |
| `$$…$$` | — |
| `\[…\]` | `$$` |
| `$…$` | `$$`, `\[` |
| `\(…\)` | `$$`, `\[`, `$` |

**2 · The patterns were unanchored, so one stray delimiter ate a paragraph.**
An unbalanced `\(` matched forward to the next `\)` *anywhere later*, pulling
headings and `**bold**` into a "math" block that never reached `inlineFmt` — so
`**Strategy**` shipped as literal asterisks. Two dollars on one line did the same
to prose: `costs $5 and the pen costs $2` is a well-formed `$…$` match.

**Why the red.** Everything swallowed was restored as literal delimited text, so
KaTeX auto-render found the pair and tried to typeset prose — sometimes
containing a raw `\x01`. With `throwOnError: false` it prints the source in
`#cc0000`. That is why literal delimiters, the leaked placeholder and the red all
appear in the same place: one cause, not four.

**Why intermittent.** Purely the delimiter mix of each individual answer. The
system prompt asks for `$`/`$$` (`ai-tutor/index.ts:3804`) while the model also
emits `\(`/`\[`, which `index.ts:1752` already expects. An answer that stays in
one style, balanced, with no stray `$`, renders perfectly.

**Not** truncation: a cut-off response fails `JSON.parse`, yields `parsed = {}`
and shows "No response received" — never partial Markdown.

## The fix, and why it is safe

Four sequential passes become **one left-to-right scan**. At each position the
scanner tries the openers longest-first; a span is accepted only if it is
well-formed, and anything else is emitted as ordinary text.

The safety argument is structural rather than empirical:

> A placeholder is only ever emitted at the **top level of the scan**, because
> accepting a span copies its source verbatim and jumps past it. No placeholder
> can therefore appear inside a stored block — so one restore pass is not merely
> adequate, it is **complete**. Defect 1 is unrepresentable, not patched.

Acceptance rules, each aimed at a confirmed failure:

| Rule | Stops |
| --- | --- |
| A closer must exist | an unbalanced `\(` reaching forward into the next paragraph |
| Inline (`\(…\)`, `$…$`) may not span a newline | one stray inline opener eating headings and bold |
| Content may not contain the opener again | mis-pairing across a nested `\[` |
| A closing inline `$` may not be glued to an alphanumeric | `$5 … $2` pairing two prices |

**Rejection is the safe direction.** A rejected span renders as source the
student can still read; a wrongly *accepted* one swallows the prose around it.
The failure mode is now "a formula shows as text", never "the answer is
destroyed".

**The second half matters as much as the first.** Rejecting a delimiter in
`renderMarkdown` is worthless if KaTeX then re-pairs it in the DOM — the
corruption would simply move one layer down. So a rejected delimiter is wrapped
in `<span class="no-katex">`, and `renderMathInEl` passes
`ignoredClasses: ['no-katex']`, which stops auto-render descending into it. The
renderer's decision about what is math becomes the only decision.

**XSS is unchanged.** Restore still escapes (`esc()`), and stray delimiters are
escaped before wrapping. The guarantee this protects is recorded in the source:
restoring raw source once made `$<img src=x onerror=…>$` execute in the
reader's session *and* in an admin's review panel, since `ai-monitor.html` shares
this module.

## Verification

`tests/chat-renderer.test.mjs` — 53 checks, written **before** the fix and red
first: 15 failures against the old renderer, including section D reporting the
literal defect (`" a = 2 and the cost rises.\n**Strategy**…"` handed to KaTeX).

Section D deserves a note. The first version asked "are the delimiters balanced"
and **passed on broken output** — a swallowed region *is* balanced; that is the
defect. It was rewritten to assert the math regions KaTeX would actually find
equal the expressions the author wrote. Per
`verification-framework-audit.md`, a check that passes for the wrong reason is
worse than no check.

Coverage: nested delimiters (all 16 ordered pairs), mixed styles, placeholder
leakage, unbalanced delimiters, currency, Markdown inside and outside math,
multi-line display math, several expressions in one answer, and XSS across every
delimiter form plus prose and bold.

Section G is a **property sweep**: 4,000 generated delimiter-soup documents
(seeded, so a failure reproduces) asserting no placeholder ever leaks, no live
`<img>`/`<script>` is emitted, and KaTeX is never handed a region containing a
placeholder. Run against the pre-fix renderer it reports **27 leaks in 4,000** —
the intermittency, measured.

## Production verification (real KaTeX)

Run against the **shipped `chat-renderer.js` served over HTTP** and driven in
Chromium with the real KaTeX 0.16.11 bundle — the same bytes production loads,
confirmed by SHA-384 against all three SRI hashes pinned in `chat.html`
(`katex.min.js`, `auto-render.min.js`, `katex.min.css` all match). **46/46.**

- All four delimiter styles typeset, plus a multi-line `aligned` block.
- Mixed `\(` + `$$` + `$` in one answer: three expressions, no error, bold intact.
- Currency renders as text and is never typeset; the bold between two prices
  renders.
- Headings, bold, italic, code, both list kinds and fenced code present in the
  DOM; fenced code is not typeset.
- XSS: no `<img>` or `<script>` injected by any delimiter form, and no payload
  executed.
- The `ai-monitor.html` path renders identically — it loads the same module.
- A differential against the pre-fix renderer: **22/22 already-correct
  constructs byte-identical**, including tables and links, which this renderer
  has never supported and which must stay literal rather than silently change.

### One finding the harness could not have produced

Two inputs still render red, and **correctly so**. `$$` cannot open display math
inside `\(` or `\[` — `\( the term $$a+b$$ matters \)` is invalid LaTeX, and
KaTeX is right to reject it. The renderer's job is not to make invalid LaTeX
valid; it is to hand KaTeX exactly what the author wrote, which it now does.

The verification asserts the stronger property instead of "no errors": the red
carries the **author's** source byte for byte. Before the fix the same input put
` the term ␁M0␁ matters ` inside the red — our placeholder. So:

> **The red caused by our corruption is gone. Red caused by the model writing
> invalid LaTeX remains, and should.** If it shows up in production, the remedy
> is the system prompt — `ai-tutor/index.ts:3804` asks for `$`/`$$` while the
> model also emits `\(`/`\[`, and mixing them is what produces `$$` nested inside
> `\(` in the first place. That is a prompt change, not a renderer change.

## Accepted trade-offs

- **Inline math may no longer span a newline** (`\(…\)`, `$…$`). Display math
  (`$$…$$`, `\[…\]`) still may, which is what `aligned` environments need. An
  inline formula broken across lines now renders as source.
- **A closing `$` glued to an alphanumeric is read as currency.** `$x$s` would
  render as text. Real notation does not do this; prices always do.
- **The committed suite models auto-render rather than running it**, since CI has
  no browser and this repo has no install step. Real KaTeX was executed
  separately, in the production verification above — the CDN is unreachable from
  the container, but `registry.npmjs.org` is not, so the exact pinned bundle was
  fetched from npm and checked against the SRI hashes before use.
- **Math inside fenced code blocks** is still stored as math before the code
  pass. Harmless: auto-render's default `ignoredTags` already covers `pre` and
  `code`, and only `ignoredClasses` was added.
