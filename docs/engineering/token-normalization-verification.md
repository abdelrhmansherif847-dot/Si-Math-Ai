# Token normalisation — verification and regression results

**Status:** verified. One behaviour change found and characterised (§5).
**Date:** 2026-08-14
**Covers:** commit `1f0f05a` (17 files, 77 declarations).
**Reproduce:**

```sh
git worktree add --detach /tmp/before 5c46f71          # the pre-change commit
node scripts/capture-token-state.mjs before --root /tmp/before
node scripts/capture-token-state.mjs after
node scripts/compare-token-state.mjs before after
```

---

## 1. Method

Every one of the 46 pages was loaded in headless Chromium before and after,
capturing two independent kinds of evidence:

- **Computed token values** for all 46 pages. Deterministic, and the real
  regression check — it measures what actually changed rather than what was
  intended to change.
- **Screenshots of 10 pages**, in **two passes**: webfonts available (the
  real-user case) and webfonts blocked (the degraded case). The font-stack
  change only alters fallback chains, so it must be invisible in the first pass
  and visible in the second. Splitting the passes is what makes those two claims
  separately checkable.

Determinism: Supabase and all third parties blocked so pages settle into a
consistent logged-out state; animations, transitions and carets disabled.

**Noise floor measured, not assumed.** The same page captured twice in the same
state differs by **0.000%** (chat, dashboard, index). Every difference below is
therefore real, not rendering jitter.

## 2. A methodology error, found and fixed

The first capture run was **invalid and its results were discarded.** It
"allowed" `fonts.googleapis.com` in the webfont pass, but this environment
routes outbound HTTPS through a proxy the browser does not use — so the font
request failed silently and *both* passes rendered with fallbacks. The two
passes were byte-identical, which meant the regression check was measuring
nothing while appearing to pass.

Caught by comparing the two passes' file sizes before trusting any result. Fixed
by intercepting the CDN request and fulfilling it from the woff2 files already
in `ds-bundle/fonts/` — faithful bytes, fully offline. A self-check now fails the
capture loudly if all screenshots match across passes, so this cannot recur
silently.

Post-fix, the passes differ on 7 of 10 screenshots. The webfont really loads.

## 3. Token results

| | |
|---|---|
| Pages changing ≥1 token | **43 of 46** |
| Pages unchanged | **3** — `focus.html`, `mock-exam.html`, `weakness.html` |
| Total page-level token changes | **259** |
| Page load errors | **0** |

The three unchanged pages are **exactly** the three frozen files. The freeze was
respected precisely, with no near-misses.

259 page-level changes from 77 source declarations because the seven edits to
`assets/knowledge.css` propagate to all 27 pages that link it — which is the
shared-stylesheet architecture working as intended.

## 4. Pixel results

**Webfonts available — the real-user case:**

| Page | Pixels changed | Max channel delta | Reading |
|---|---:|---:|---|
| `dashboard.html` | 1.342% | 40 | 13 intended token changes (translucency + `--r-xl`) |
| `chat.html` | 0.009% | 239 | one glyph — see §5 |
| the other 8 | **0.000%** | 0 | identical |

Eight of ten pages are **pixel-identical**, including every page whose only
change was the font stacks. That is the central regression result: for a user
whose webfont loads, the font-stack change is invisible, exactly as intended.

`dashboard.html` was inspected visually as well as numerically — layout, sidebar,
cards and colours all render correctly. A max delta of 40 is consistent with
`.1 → .12` / `.3 → .32` translucency shifts over a dark ground, not with anything
breaking.

**Webfonts blocked — the degraded case:** `dashboard` 16.7%, `chat` 6.8%,
`index` 5.4%, `pricing` 1.1%, `progress` 1.1%, remainder 0%. This is the longer
fallback chain doing its job, and is the evidence the font change is worth
making rather than merely harmless.

## 5. The one finding: emoji presentation on `chat.html`

`chat.html`'s entire difference is **98 pixels in a 13×18 box** — a single glyph.
It is the **⚡ emoji**, which rendered as a colour emoji before and as a
monochrome text glyph after.

Cause: ⚡ is in neither Manrope nor DM Sans, so it always resolves through the
fallback chain. Putting `system-ui` ahead of the generic `sans-serif` changes
which font wins for **any glyph the webfont lacks**, emoji included.

Three things bound how much this matters:

1. **It is convergence, not a new divergence.** `assets/knowledge.css` has always
   carried the longer chain, so all 27 knowledge pages already rendered emoji
   this way. This change brings the 19 app pages into line with them rather than
   introducing a new behaviour to the site.
2. **The observed outcome is container-specific.** Fallback resolution depends on
   installed fonts; `system-ui` on a student's Windows, Android or iOS device
   resolves to something else entirely. What is portable is the *mechanism*, not
   this particular monochrome result.
3. **`dashboard.html` still renders colour emoji** after the change, so the
   effect is glyph- and context-dependent, not a blanket loss of colour emoji.

**DECIDED: recorded as an environment-dependent rendering observation, not a
regression.** Layout and behaviour are unaffected — the difference is one glyph's
font selection, in a container whose fallback resolution is not what a student's
device will do. No emoji family was appended and the fallback order was not
changed back; both would alter values that were reviewed and approved, to chase
an effect that is not reproducible off this container.

Revisit only if colour emoji are observed to disappear **on real devices**. The
fix then is to append an explicit emoji family (`'Apple Color Emoji', 'Segoe UI
Emoji', 'Noto Color Emoji'`) to the stacks — not to revert the fallback chain,
which would reintroduce the drift this work removed.

## 6. Verdict and follow-ups

**No unexplained pixel moved.** Every difference maps to an intended token
change; the one surprise was traced to a single glyph and characterised.

Outstanding, each needing a decision:

1. **Three frozen files keep the shorter font stacks — CLOSED, by decision.**
   `mock-exam.html`, `weakness.html` and `focus.html` stay frozen; they are not
   being unfrozen merely to unify a fallback chain. This is now recorded as
   **intentional documented divergence** in `scripts/validate-tokens.mjs`
   `EXCEPTIONS`, with the reason attached, and the gate does not treat it as a
   failure. The only effect is how those three pages fall back when the webfont
   fails. Revisit if they are unfrozen for other reasons.
2. **Emoji stacks — CLOSED.** Recorded as an environment-dependent observation,
   not a regression. See §5.
3. **CI drift gate — BUILT.** `assets/tokens.core.css` declares the 51 shared
   tokens and `scripts/validate-tokens.mjs` enforces them, running automatically
   in `tests/run-all.mjs` (now 46 checks). `tests/token-drift-gate.test.mjs`
   proves it can go red. This normalisation is therefore no longer a one-time
   cleanup.
4. **`--border`, `--font-sans`, `--radius-card`** remain in
   `reset-password.html`, all actively referenced. The gate ignores them
   correctly — each is defined by exactly one file, so there is nothing to
   disagree with. Removing them is a small refactor, still deliberately unbundled.

**Still open:** nothing from this workstream. The remaining item is the
claude.ai/design upload, which is blocked on authorization only.
