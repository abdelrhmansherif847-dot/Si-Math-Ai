# Architectural assessment — Si Math AI

**Date:** 2026-08-05 · **Scope:** whole codebase · **Changes made:** none.
Assessment and roadmap only, as requested.

---

## 1. Does the project need a full refactoring?

**No. A full refactor is NOT recommended.**

The architecture is deliberate, coherent, and — measured rather than assumed —
healthier than its raw file sizes suggest. A project-wide refactor would consume
significant engineering time, carry real risk against a live student platform,
and fix problems that largely do not exist.

Three findings drive that conclusion:

**The "no bundler, self-contained pages" design is a decision, not neglect.**
`CLAUDE.md` states it explicitly: the same bytes run in Deno, in Node under CI,
and in the browser, and tests execute the *real shipped source* rather than a
paraphrase. That property is why this project can test an Edge Function's regex
against production behaviour with `node`, with no build step. A conventional
refactor (bundler, module system, framework) would destroy it and replace a
working constraint with a toolchain.

**The shared-module pattern is already in use, and working.** Nineteen modules
are already extracted (`plan-catalog.js`, `credit-config.js`, `assets/streak.js`,
`_shared/taxonomy.core.js`, …), several with CI drift-detection. This is not a
codebase that failed to modularise; it is one that modularises where it pays.

**The safety net is unusually strong for a project this size:** 24 test suites +
7 validators = 31 CI checks, plus a 46-page browser smoke gate. Refactoring is
safest where tests are strong — but the corollary is that this codebase is not
currently *suffering* from the defects refactoring prevents.

**And the largest genuine debt was already paid down this week.** Three duplicate
day-key implementations collapsed into one; then the whole client-side streak
computation collapsed into a Postgres function, deleting ~200 lines of
compensating machinery. The biggest architectural knot in the codebase is gone.

---

## 2. Severity classification

| Severity | Count | Summary |
|---|---|---|
| **Critical** | **0** | Nothing threatens correctness, security or availability. |
| **High** | **2** | Config duplicated across 20 files; 753 KB of base64 in the landing page. |
| **Medium** | **2** | `chat.html` carries 2,653 lines of inline JS; `esc()` defined 15×. |
| **Low** | **3** | `fmtDate()` ×3; unpinned CLI; naming drift. |

---

## 3. Concrete technical debt (measured)

### HIGH-1 — Supabase URL and publishable key hardcoded in 20 files each

```
Supabase URL literal : 20 files
anon/publishable key : 20 files
```

Not a security hole (the publishable key is public by design), but a genuine
**operational** coupling: rotating the key, or pointing a page at a staging
project, means editing twenty files with no compile-time check that you got them
all. This is the highest-value item in the whole assessment — mechanical,
verifiable, and it removes a real class of future mistake.

### HIGH-2 — `index.html` is 853 KB, of which 753 KB is embedded base64

```
index.html: 2,192 lines / 853 KB
  line 2079: 289,086 chars  (const moods=["data:image/png;base64,...
  line 1235: 134,600 chars  (<img src="data:image/jpeg;base64,...
  753 KB of embedded base64 out of 853 KB total
```

The landing page ships **~750 KB of images inline**, so they cannot be cached
separately, cannot be lazy-loaded, and are re-downloaded on every visit. This is
the only finding with a direct, measurable effect on real students — and on the
first page a prospective student ever loads, frequently on mobile data in Egypt.

Note this is *not* code complexity: 2,192 lines is a modest page. The file is
large because of payload, which makes it a **performance** item, not a structural
one — and correspondingly low-risk to fix.

### MEDIUM-1 — `chat.html`: 3,428 lines, 19 script blocks, 2,653 lines of inline JS

The genuine complexity hotspot. Inline JS cannot be unit-tested directly; the
project works around this with `tests/_source.mjs` `slice()`, extracting named
blocks by string matching — which works, but is brittle and depends on comment
text remaining stable.

### MEDIUM-2 — `esc()` defined in 15 files

The single most duplicated helper. Every copy is an HTML-escaping function, and
this session found a **real XSS** that existed because one call site did not use
one. Consolidation is desirable in principle — but see §5 for why it is not first.

### LOW — `fmtDate()` ×3; unpinned Supabase CLI (`npx supabase` always latest, which
made this week's deploy authentication a surprise); minor naming drift
(`escapeHtml` vs `esc`).

### Explicitly NOT debt (verified, so it is not re-litigated later)

* **`ai-tutor/index.ts` at 4,648 lines** — large, but **63 top-level functions**
  (~74 lines each) and a substantial fraction is LLM prompt text, which is
  configuration, not logic. It is long, not tangled. Splitting it would add a
  multi-file bundle risk to the single most outage-prone deploy path in the
  project, for readability alone. **Leave it.**
* **`taxonomy.core.js` loaded by zero pages** — by design; it is the authored
  source synced into two copies with CI failing on drift.
* **`focus-templates.js`, `kdg-representation.js`** — deliberate scaffolding, one
  with its own validator.
* **19 `createClient()` calls** — one per page, which is correct for
  self-contained pages. Not duplication in any meaningful sense.

---

## 4. Risks of a large refactor right now

1. **Production is live with real students, mid exam-prep season.** `CLAUDE.md`
   opens by noting incidents have direct student impact during exam windows.
2. **No compile-time safety net.** No bundler, no TypeScript on the client, no
   module system. A renamed function in an inline `<script>` fails at runtime, in
   a student's browser, not at build time.
3. **The test suite pins behaviour, not structure.** It executes shipped source
   by *string-slicing* named blocks. Large-scale renaming or moving code silently
   breaks the extraction — tests may pass while testing nothing, which is exactly
   the vacuous-check failure this repo has a written rule against.
4. **Two of the largest files are frozen** (`weakness.html`, `focus.html`,
   plus `mock-exam.html`), so any "consistent everywhere" refactor is
   structurally impossible to complete.
5. **The strongest evidence is from this week.** In this very audit, **five of six
   defects found by adversarial testing were introduced by my own fixes** — and
   every one passed CI at the time. That is the measured local rate at which
   careful changes to this codebase introduce defects. A project-wide refactor is
   that same risk, multiplied across every file, for no user-visible gain.

---

## 5. What I would refactor first — and what I would not touch

### Do first (highest value ÷ risk)

**1. Centralise the Supabase config (HIGH-1).** One `assets/supabase-config.js`
exporting URL and publishable key; pages read from it. Mechanical, individually
verifiable, ~20 small diffs, and it removes an entire class of future error.
*Frozen-file caveat:* three pages cannot be updated, so the constants must remain
valid — this is additive, not a migration.

**2. Extract the base64 images from `index.html` (HIGH-2).** Move the ~750 KB of
inline images to `assets/` files. Pure payload change, no logic touched, directly
improves first-load time for every prospective student. Verifiable by file size
and the existing smoke gate.

### Do later, only with a reason

**3. `esc()` consolidation (MEDIUM-2)** — only if a shared page-shell script is
introduced for another reason. On its own it means adding a `<script>` tag to 15
pages (3 frozen) to save a few dozen lines. That is a wide blast radius for a
cosmetic gain.

**4. `chat.html` inline JS (MEDIUM-1)** — extract only when a feature requires
touching a given block anyway. Opportunistic, never wholesale.

### Explicitly leave untouched

* The **no-bundler, self-contained-page architecture** — it is load-bearing.
* **`ai-tutor/index.ts`** — long but structured; splitting it endangers the
  riskiest deploy path in the project.
* **`taxonomy.core.js`** and the sync/drift mechanism.
* **All frozen files.**
* **The 19 per-page `createClient()` calls.**
* **Anything with no failing test and no user complaint behind it.**

---

## 6. Benefit vs risk

| Item | Benefit | Risk | Verdict |
|---|---|---|---|
| Centralise config | Removes a real operational error class | Low — additive, mechanical | **Do it** |
| Extract base64 images | ~750 KB off the landing page, every visit | Low — payload only | **Do it** |
| Consolidate `esc()` | Modest consistency | Medium — 15 pages, 3 frozen | Defer |
| Split `chat.html` JS | Better testability | Medium-High — 2,653 lines, brittle test extraction | Opportunistic only |
| Split `ai-tutor/index.ts` | Readability | **High** — endangers the multi-file bundle deploy | **No** |
| Full project refactor | Largely aesthetic | **High** — no compile safety, live users, frozen files, measured 5-of-6 defect-introduction rate | **No** |

**Net:** the two HIGH items are worth doing and are together perhaps a day of
careful work with low risk. Everything below them costs more than it returns
*at this moment*. The honest summary is that this codebase's remaining debt is
**narrow and well-understood**, not broad and structural.

---

## 7. Recommendation

**Do not undertake a full refactor.** The architecture is healthy for what it is
and for the constraints it was built under.

Do two targeted pieces of work — centralise the Supabase config, and get 750 KB
of base64 out of the landing page — then stop. Both are individually revertible,
neither changes behaviour, and both remove something real: one an operational
hazard, the other a cost paid by every visitor.

The most valuable thing this codebase could receive next is **not** refactoring
at all. It is the one thing still unverified from the last sprint: a manual
production pass on the Study Planner and credit deduction. Correctness that is
unproven outranks structure that is merely imperfect.
