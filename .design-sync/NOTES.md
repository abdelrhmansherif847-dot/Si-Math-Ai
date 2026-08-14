# design-sync notes — Si Math AI

Repo-specific gotchas for future syncs. Read alongside `config.json`.

## ▶ UPLOAD RUNBOOK — read this first

The bundle is **built and validated**; only the upload is outstanding. It was
blocked because `DesignSync` cannot authorize in a non-interactive environment
(claude.ai/code has no terminal for `/design-login`). In a session that DOES
have design authorization, do exactly this — **do not re-run the /design-sync
skill's discovery**, it will try to detect a `storybook` or `package` shape and
neither applies here:

```sh
node .design-sync/build-tokens.mjs                 # rebuild ds-bundle/ (deterministic)
node .ds-sync/package-validate.mjs ./ds-bundle     # must print "✓ bundle is complete"
```

The build fetches the brand fonts on first run if `ds-bundle/fonts/` is absent,
so a fresh clone reproduces the whole bundle from that one command — verified by
deleting `ds-bundle/` and rebuilding. **It needs network the first time.** Built
offline, the bundle still validates (a missing font is only a warning) but ships
with system fonts, so confirm `ls ds-bundle/fonts/*.woff2 | wc -l` is 28 before
uploading. If the validator is unavailable, the build alone is not sufficient
evidence — do not upload an unvalidated bundle.

Then, with the `DesignSync` tool:

1. `list_projects` → pick a non-colliding name → `create_project` (this repo has
   never uploaded, so **create a fresh project**; do not adopt an existing one).
2. **Record the returned `projectId` in `.design-sync/config.json` immediately**,
   before uploading anything. A crash after upload but before recording orphans
   the project and the next sync creates a duplicate.
3. `finalize_plan` with `localDir: "./ds-bundle"`,
   `writes: ["tokens/**", "fonts/**", "_ds_bundle.js", "_ds_bundle.css", "styles.css", "README.md", "_ds_sync.json", "_ds_needs_recompile"]`,
   `deletes: ["tokens/**", "fonts/**"]`.
4. `write_files` the sentinel `_ds_needs_recompile` first, then the content.
   **The 28 woff2 files plus the rest exceed comfortable chunking — split into
   two or three `write_files` calls** (the hard cap is 256 files per call).
   Prefer `localPath` over inline `data` so file bytes never enter context.
5. Re-write `_ds_needs_recompile`, then `write_files` `_ds_sync.json` **last, in
   its own call** — the anchor must only ever vouch for a fully-applied state.
6. Commit the `projectId` change and report `https://claude.ai/design/p/<projectId>`.

There are **no components**, so there is no preview-grading loop to run and no
`components/**` to upload — the empty `components/` dir is a local validator
requirement only (see below).

## The shape: off-script, tokens-only

- **`package-build.mjs` cannot run here and never will.** It consumes a built
  `dist/` entry plus a `.d.ts` tree and compiles React components into
  `_ds_bundle.js`. This repo has no `package.json` anywhere, no bundler and no
  JS component library — deliberately, per `CLAUDE.md`. Neither the `storybook`
  nor the `package` shape applies.
- **`.design-sync/build-tokens.mjs` is the converter.** It reads the site's own
  `:root` blocks and `assets/knowledge.css` and emits the upload layout into
  `ds-bundle/`. Deterministic; re-run any time the site's tokens change.
- `package-validate.mjs` is still the gate and **passes clean** (`✓ bundle is
  complete`, exit 0). It has first-class support for this case — the source
  comments name "tokens-only sync (componentCount 0)" explicitly and skip the
  bundle-export smoke check for an empty component list.

## Running the build and the gate

```sh
node .design-sync/build-tokens.mjs
DS_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell \
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
node .ds-sync/package-validate.mjs ./ds-bundle
```

- The validator **requires playwright importable** or it fails `[RENDER_SKIPPED]`.
  `npm i playwright` inside `.ds-sync/` provides it, but the version it wants
  (chromium build 1234) does not match the image's pre-installed 1194 — hence
  `DS_CHROMIUM_PATH` pointing at the real binary. Do not run
  `npx playwright install`; the browser is already there.
- The build creates an **empty `ds-bundle/components/`** on purpose. The
  validator's render check walks that directory unconditionally and crashes with
  `ENOENT` without it. An empty dir lets the check actually run and report
  `0/0 previews`, which is the truthful result. Passing `--no-render-check`
  instead would record "previews are NOT visually verified" — a claim of a gap
  where there is simply nothing to verify.
- `styles.css` must `@import "./_ds_bundle.css"` **with the `./` prefix**. The
  validator matches that literal form to prove component CSS is inside the
  closure a rendered design receives; `"_ds_bundle.css"` fails `[CSS_BUNDLE_UNREACHABLE]`.

## Token drift found in the site (a real finding, not a build quirk)

68 distinct tokens across 20 `:root` blocks; **27 disagree between pages.** The
build resolves them by majority after normalising notation. Some are cosmetic
(`#fff` vs `#ffffff`, `rgba(56,189,248,.1)` vs `.10` vs spaced), but these are
genuine and worth fixing at source:

| Token | Majority | Outlier |
|---|---|---|
| `--green` | `#22c55e` ×16 | `#4ade80` — `assets/knowledge.css`, `reset-password.html` |
| `--amber` | `#f5b942` ×15 | `#f59e0b` — `assets/knowledge.css` |
| `--red` | `#ef4f5f` ×15 | `#f87171` — `reset-password.html` |
| `--purple` | `#a855f7` ×6 | `#a78bfa` — `ai-monitor.html` |
| `--*-soft` / `--*-border` | `.12` / `.32` ×13 | `.1` / `.3` — `dashboard.html` |
| `--r-xl` | `24px` ×18 | `26px` — `dashboard.html` |

Three single-use tokens are **excluded** from the shipped set as near-duplicates
that would give the design agent two names for one decision — worth deleting at
source: `--border: #1a2640` (a near-miss of `--border-soft: #1a2540`),
`--font-sans` (duplicates `--font-body`), `--radius-card: 16px` (sits between
`--r-md` 14 and `--r-lg` 20).

Genuinely surface-specific, **not** drift, and documented in `conventions.md`
rather than reconciled: `--nav-h` (56 marketing / 58 app / 60 dashboard) and
`--side-w` (248 / 256 / 262).

The `--fs-*` ladder is defined in only two files, which tie 1-1. `index.html`
wins on completeness (it is the only one with `--fs-small`/`--fs-micro` and a
three-step ladder). `assets/knowledge.css` runs a slightly smaller ladder
(34/25/18/16 base, 54/34/20/17 at tablet) that this build does not ship.

## Fonts

- The live site loads Manrope, DM Sans and JetBrains Mono from the Google Fonts
  CDN via `<link>` on all 46 pages. There are **no local font files in the repo**.
- The build downloads them as woff2 into `ds-bundle/fonts/` (28 files, 632 KB,
  latin + latin-ext) so previews render in the real brand faces rather than
  system fallbacks. Verified: all 28 faces reach `status: loaded`.
- **Arabic is not covered, and that is faithful.** The site ships no Arabic
  webface, so Arabic text (which the tutor does produce) already falls back to
  system fonts in production. Shipping an Arabic subset here would make the
  design tool render something the real site cannot.

## Scope limits carried into `conventions.md`

- `_ds_bundle.css` is `assets/knowledge.css` — the **marketing and knowledge-page**
  stylesheet, 101 `.k-*` classes. The logged-in app screens (chat, dashboard,
  progress, focus) style themselves with per-page CSS embedded in each HTML file
  and are **not** shipped. Any future work to cover app UI means extracting that
  inline CSS first.
- Its `:root` blocks are stripped at build time so `tokens/tokens.css` is the
  single definition site.

## Re-sync risks

- **No `projectId` recorded.** The upload never happened: `DesignSync` could not
  authorize in this environment (claude.ai/code has no interactive terminal for
  `/design-login`). The next sync with working auth must create or adopt a
  project and record its id in `config.json`. There is no `_ds_sync.json` in any
  remote project, so the next sync correctly has no anchor and rebuilds fully.
- **The build reads the site directly.** Any page that adds a `:root` block, or
  shifts a majority, silently changes the shipped tokens. Re-read the drift table
  above after a redesign — a new outlier could flip a majority without warning.
- **Fonts are fetched over the network at build time.** An offline run produces
  no `fonts/` and the validator warns `[FONT_MISSING]` (a warning, not an error),
  so a bundle built offline would ship with system fonts and still pass. Check
  the font count before uploading.
- **`assets/knowledge.css` is the only shared stylesheet.** If the site ever
  splits it or adds a second, `build-tokens.mjs` needs updating — it hard-codes
  that one path.
- The `config.json` here carries `shape: "tokens-only"`, which the skill's own
  scripts do not recognise. It is read by humans and by `build-tokens.mjs`, never
  by `package-build.mjs`. Do not "fix" it by inventing a `pkg` field.
