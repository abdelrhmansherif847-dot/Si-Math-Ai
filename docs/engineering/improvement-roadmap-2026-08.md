# Implementation roadmap — high-value, low-risk improvements

**Date:** 2026-08-05 · **Changes made:** none. Plan only.
Follows `architecture-assessment-2026-08.md`, which concluded a full refactor is
not justified.

**Headline:** of the two items the assessment flagged as HIGH, deeper inspection
says **do one and do NOT do the other as scoped**. A cheaper alternative to the
second is proposed that captures the real benefit at near-zero risk.

| # | Item | Verdict | Risk | Effort |
|---|---|---|---|---|
| 1 | Extract base64 assets from the landing page | **DO** | Low | ~2–3 h |
| 2 | Consolidate Supabase config into a shared module | **DO NOT** (as scoped) | Medium, page-fatal | ~4–6 h |
| 2b | *Alternative:* CI guard that the copies never diverge | **DO** | ~Zero | ~30 min |
| 3 | Cache headers for image assets | **DO** (with #1) | Low | ~15 min |
| 4 | Pin the Supabase CLI version | **DO** | ~Zero | ~15 min |
| 5 | Favicon on the 3 frozen pages | **ASK FIRST** | Low | ~10 min |

---

## 1. Extract the inline base64 assets from `index.html` — **DO**

### Why it is worth doing

Measured, not estimated:

```
data URIs found        : 18
base64 payload         : 753 KB   (ships today, inside the HTML)
decoded binary         : 565 KB   (what would ship as files)
pure encoding overhead : 188 KB   (~33%, saved outright)
index.html total       : 853 KB  ->  100 KB after extraction
```

Three separate wins, in order of size:

1. **188 KB disappears immediately.** Base64 inflates binary by ~4/3. That third
   is pure waste — it buys nothing at any cache state.
2. **The images become independently cacheable.** Today they live *inside* the
   HTML, and `vercel.json` serves HTML as `max-age=0, must-revalidate`. So every
   time the landing-page copy changes — marketing text, a price, a testimonial —
   **all 753 KB is re-downloaded**, because the images are part of the document.
   As files they survive HTML edits untouched.
3. **They become parallelisable and lazy-loadable.** Inline data URIs are parsed
   as part of the HTML, blocking first render on bytes the user may never scroll
   to. Five of them are below-the-fold "state" images.

This is the only finding in the whole assessment with a direct, measurable cost
to real students — on the **first page a prospective student ever loads**, often
on Egyptian mobile data.

### What the work actually is (inspected, not assumed)

All 18 consumers are trivial substitutions. There is no logic to restructure:

* **13 static `<img src="data:…">`** (lines 1235, 1268, 1345, 1353, 1359,
  1639–1643, 1998, 2007) → `src="assets/…"`.
* **1 JS array** — `const moods=[…]` (line 2079, the 289 KB line): four PNGs
  consumed only by `hm.src = moods[mi]` at line 2083. Becomes an array of paths;
  the consumer is unchanged.
* **2 template literals** (lines 2055, 2062) building `<div class="av ai"><img
  src="data:…">` — same substitution inside the string.

The CSP already permits it: `img-src 'self' data: blob: …` covers both forms, so
no `vercel.json` security change is needed.

| | |
|---|---|
| **Effort** | 2–3 hours: decode 18 blobs to files, substitute, verify byte-for-byte identical rendering |
| **User impact** | **High and positive.** ~750 KB off the landing page; repeat visits and post-edit visits far cheaper |
| **Risk** | **Low.** Payload only — no logic, no auth, no data path. Worst case is a broken image, visible instantly |
| **Rollback** | `git revert` of one commit. Fully self-contained; no schema, no deploy coupling |
| **Files changed** | `index.html`, plus ~14 new files in `assets/` |
| **Gain** | 853 KB → ~100 KB HTML; 188 KB never sent again; images cache across HTML changes |

### Verification before merge

`scripts/smoke-pages.mjs` already fails on failed local resource loads, so a
mistyped path fails CI. Add a visual check at 1280px and 360px, and confirm the
mood-cycling animation still advances.

---

## 2. Consolidate the Supabase config — **DO NOT DO, as scoped**

The assessment rated this HIGH. **Closer inspection reverses that.** I am
recommending against it, as you asked me to do if the cost outweighed the value.

### What the inspection found

**(a) 3 of the 20 files are frozen** — `focus.html`, `mock-exam.html`,
`weakness.html`. They cannot be edited without unfreezing. So after the work,
17 files read from a shared module and **3 still hold hardcoded literals**. The
stated benefit — "rotate the key by editing one file" — is *not achieved*. You
would still edit three frozen files, which needs approval anyway.

**(b) The pattern is not uniform**, so this is not a mechanical find-and-replace:

```
const SUPABASE_URL = '…'      var SUPABASE_URL = '…'
const sb = window.supabase.createClient(…)
const sb = supabase.createClient(…)
const supabaseClient = window.supabase.createClient(…)
```

Three different client variable names, two declaration keywords, two ways of
reaching the SDK. Each of 17 pages needs individual reading.

**(c) The failure mode is page-fatal.** This is the auth bootstrap. If the shared
script has not loaded when the inline block runs, `createClient` throws and the
**entire page is dead** — not degraded. There is no bundler and no compile-time
check to catch an ordering mistake; it surfaces in a student's browser.

This is not hypothetical for this codebase. Earlier in this very audit,
referencing `SiDay` unconditionally in `dashboard.html` turned one missing
non-critical asset into a whole dead dashboard showing "Could not load".

**(d) The benefit is a rare operation.** The publishable key is public by design
and rotates rarely; the staging-project scenario is hypothetical today.

### The honest cost/benefit

| | |
|---|---|
| **Effort** | 4–6 hours (17 non-uniform pages, individually verified) |
| **User impact** | **Zero** when it works |
| **Risk** | **Medium**, with a *page-fatal* failure mode across 17 production pages |
| **Benefit** | Partial — 17/20; frozen files still require separate edits |

**Verdict: not worth it.** Meaningful risk on the most critical code path in
every page, spread across seventeen files, to make a rare operation slightly
easier — and even then incompletely.

### 2b. The alternative that captures the real benefit — **DO**

The actual risk here is not "the value lives in 20 places". It is **"the 20
copies could silently disagree"** — one page pointed at the wrong project, or a
half-finished rotation. That is a *drift* problem, and this repo already has the
right tool for drift: a CI check.

Add to `tests/repo-integrity.test.mjs`: assert every file containing a Supabase
URL or publishable key uses **exactly one** distinct value for each.

| | |
|---|---|
| **Effort** | ~30 minutes |
| **User impact** | None directly; prevents a class of outage |
| **Risk** | **Zero** — a test. Cannot affect production |
| **Rollback** | Delete the assertion |
| **Files changed** | `tests/repo-integrity.test.mjs` only |
| **Gain** | A half-finished key rotation fails CI instead of reaching students. Covers **all 20** files, frozen ones included — which the consolidation could not |

This is strictly better than the refactor: broader coverage, no production risk,
one-twelfth the effort.

---

## 3. Cache headers for image assets — **DO, alongside #1**

`vercel.json` has **no** image caching rule (verified: 0 image-related rules), so
the new asset files would fall to Vercel's default. Item #1's caching benefit is
only fully realised if the files are served with a long `max-age`.

Add a `source: "/assets/(.*\\.(png|jpg|jpeg|svg|webp))"` header with
`public, max-age=31536000, immutable`. Safe because these are content-addressed
by filename; changing an image means a new filename.

| | |
|---|---|
| **Effort** | 15 minutes | **Risk** | Low — headers only |
| **Rollback** | Revert the `vercel.json` hunk |
| **Files changed** | `vercel.json` |

**Sequencing:** ship with or immediately after #1. On its own it does nothing,
since the images are not files yet.

---

## 4. Pin the Supabase CLI version — **DO**

`scripts/deploy-ai-tutor.sh` falls back to `npx supabase` **unpinned**, so every
deploy uses whatever is latest that day. That is exactly what made this week's
deploy authentication a surprise: `login` succeeded while `projects list`
returned 401, and the error codes turned out to be `Legacy*`-prefixed.

Pin to a known-good version (`npx supabase@2.111.0`) so deploys are reproducible
and a CLI release cannot change deploy behaviour unannounced.

| | |
|---|---|
| **Effort** | 15 minutes | **Risk** | ~Zero — the pinned version is the one that just deployed successfully |
| **Rollback** | Revert one line |
| **Files changed** | `scripts/deploy-ai-tutor.sh`, `DEPLOY.md` |
| **Gain** | Reproducible deploys on the project's most outage-prone path |

---

## 5. Favicon on the three frozen pages — **ASK FIRST**

`focus.html`, `mock-exam.html` and `weakness.html` are the last pages without a
favicon. Two `<link>` tags each — but they are frozen, and I will not edit a
frozen file for something cosmetic without you unfreezing it.

| | |
|---|---|
| **Effort** | 10 minutes | **Risk** | Low, but requires unfreezing |
| **Gain** | Branding consistency finished |

---

## Recommended order

1. **#2b** — CI drift guard (30 min, zero risk). Do it first: it protects the
   config *before* anything else moves.
2. **#4** — pin the CLI (15 min, zero risk).
3. **#1 + #3** — extract the base64 assets and add cache headers, as one
   reviewable change (~3 h). The only user-visible win in the list.
4. **#5** — only if you unfreeze those pages.
5. **#2** — **do not do.**

Total worthwhile work: roughly **half a day**, one commit per item, each
independently revertible, none touching business logic, schema or APIs.

## What this roadmap deliberately excludes

`esc()` ×15 and `fmtDate()` ×3 consolidation, splitting `chat.html`'s 2,653 lines
of inline JS, and splitting `ai-tutor/index.ts`. All were assessed; all cost more
than they return today. The reasoning is in
`architecture-assessment-2026-08.md` §5 and is not repeated here.
