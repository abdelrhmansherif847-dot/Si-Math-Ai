# Building with Si Math AI

**There is no JavaScript component library. Do not try to import components.**
Si Math AI is a static HTML + CSS platform, so this design system ships a token
layer, three self-hosted brand fonts, and one shared stylesheet of real classes.
Build with plain HTML elements, the `.k-*` classes below, and `var(--token)`
values. `window.SiMathAI` exists but is deliberately empty.

## Setup

Link `styles.css` and put everything on the dark ground. **The system is
dark-only** — there is no light theme and no `prefers-color-scheme` anywhere in
the source, so never render Si Math AI UI on a light background.

```html
<link rel="stylesheet" href="styles.css">
<body style="background:var(--bg); color:var(--text-200); font-family:var(--font-body)">
  <main class="k-main">
    <section class="k-section"><div class="k-wrap"> … </div></section>
  </main>
</body>
```

`.k-main` reserves the nav height, `.k-section` applies vertical rhythm and
draws a divider between siblings, `.k-wrap` centres at `--maxw` (860px) with
`--container-x` gutters. `.k-wrap-wide` is the 1140px variant.

## The idiom: tokens for values, `.k-*` classes for parts

No utility classes and no style props. Every value comes from a custom property.

| Family | Tokens |
|---|---|
| Surface | `--bg` `--bg-elev-1` `--bg-elev-2` `--bg-card` `--bg-card-hi` `--bg-glass` |
| Brand | `--cyan` `--cyan-2` `--cyan-3` `--cyan-bg-soft` `--cyan-bg-med` `--cyan-border` `--cyan-border-soft` `--cyan-glow` |
| Status | `--green` `--amber` `--red` `--purple` `--gold`, each with `-soft` (fill) and `-border` |
| Text | `--text-100` … `--text-500`, brightest to dimmest — **solid colours only, never opacity-based whites** |
| Border | `--border-soft` `--border-mid` |
| Radius | `--r-sm` 10 · `--r-md` 14 · `--r-lg` 20 · `--r-xl` 24 · `--r-full` |
| Spacing | `--space-1` … `--space-10` (4, 8, 12, 16, 20, 24, 32, 40, 56, 72px) |
| Type | `--font-display` (Manrope) `--font-body` (DM Sans) `--font-mono` (JetBrains Mono); `--fs-h1` `--fs-h2` `--fs-h3` `--fs-body` `--fs-small` `--fs-micro` |
| Layout | `--nav-h` `--side-w` `--container-x` `--section-y` `--maxw` |

`--fs-*`, `--section-y`, `--container-x` and `--nav-h` **scale responsively** at
768 / 1024 / 1440px — use the token, never a hard-coded px, or the layout stops
scaling.

Headings use `--font-display`; body copy uses `--font-body`; numbers, code and
labels use `--font-mono`.

Class vocabulary, all prefixed `k-`:

- **Structure** `k-main` `k-wrap` `k-wrap-wide` `k-section` `k-grid` `k-grid-2` `k-grid-3` `k-hr` `k-crumb`
- **Text** `k-eyebrow` (small caps label) `k-lead` (intro paragraph) `k-body` `k-note` `k-tag`
- **Surfaces** `k-card` `k-card-icon` `k-cap` `k-cap-head` `k-cap-icon`
- **Actions** `k-btn` plus one of `k-btn-primary` `k-btn-ghost` `k-btn-purple`; wrap several in `k-btn-row`
- **Chips** `k-chip` inside `k-chips`
- **Nav / footer** `k-nav` `k-nav-links` `k-nav-cta` `k-nav-logo` `k-footer` `k-footer-grid` `k-footer-bottom`
- **Content patterns** `k-faq*` `k-flow*` `k-log*` `k-pillar*` `k-guide*` `k-ev*` `k-res*` `k-system*` `k-table` `k-table-scroll` `k-qa` `k-steps` `k-toc` `k-takeaways`

## Where the truth lives

Read the real files before styling — they beat any summary:

- `tokens/tokens.css` — every token and the responsive ladder
- `tokens/tokens.json` — the same values, machine-readable
- `_ds_bundle.css` — every class above, with its actual rules
- `styles.css` — the entry point; rendered designs receive its `@import` closure only

## Two scope limits worth knowing

1. `_ds_bundle.css` is the **marketing and knowledge-page** stylesheet. The
   logged-in app screens (chat, dashboard, progress) style themselves with
   per-page CSS that is not shipped here. Composing app UI means building from
   tokens rather than reaching for a `.k-*` class that won't fit.
2. Those app screens override two layout tokens: `--nav-h: 58px` and a
   `--side-w: 262px` sidebar. Apply those when designing an app shell.

## A real example

```html
<section class="k-section">
  <div class="k-wrap">
    <div class="k-eyebrow">Adaptive practice</div>
    <h2 style="font-family:var(--font-display); font-size:var(--fs-h2); color:var(--text-100)">
      Practice that follows your weaknesses
    </h2>
    <p class="k-lead">Zero tracks 33 subtopics and rebuilds your plan after every session.</p>
    <div class="k-grid k-grid-3" style="margin-top:var(--space-7)">
      <div class="k-card">
        <div class="k-eyebrow">Mastery</div>
        <p class="k-body">Per-subtopic scores update as you answer.</p>
        <div class="k-chips"><span class="k-chip">SAT</span><span class="k-chip">EST</span></div>
      </div>
    </div>
    <div class="k-btn-row" style="margin-top:var(--space-6)">
      <a class="k-btn k-btn-primary" href="#">Start practising</a>
      <a class="k-btn k-btn-ghost" href="#">See how it works</a>
    </div>
  </div>
</section>
```
