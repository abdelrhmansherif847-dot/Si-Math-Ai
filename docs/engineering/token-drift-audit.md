# Design token drift — audit and single-source proposal

**Status:** audit complete. §4 was decided and applied in commit `1f0f05a`;
results verified in `token-normalization-verification.md`. "agreed everywhere"
went 41 → 58 tokens, and the only divergence left is the three font stacks held
by the three frozen files. §5's mechanism (one authored source + a CI drift gate)
is still **not built** — until it is, this was a one-time cleanup rather than a
guarantee.
**Date:** 2026-08-14
**Reproduce:** `node scripts/audit-tokens.mjs` (add `--json` for machine output).
The script reports only; it changes nothing and always exits 0.

Raised while syncing the design language to claude.ai/design. That sync resolves
divergent tokens by majority vote *in its own output* — which is correct for the
bundle but leaves the site itself internally inconsistent. This audit is the
first half of fixing the cause rather than the symptom.

---

## 1. The architecture is already half-solved

| | Pages | Token source |
|---|---:|---|
| Knowledge / marketing | 27 | link `assets/knowledge.css` — **already one source** |
| App | 19 | each carries a **private inline `:root`** |
| **Total** | **46** | |

There is **no overlap and no gap** — every page falls in exactly one bucket.
So this is not "46 pages disagree". It is: *19 app pages each keep a private
copy of the token block, and those copies have drifted from each other and from
the shared stylesheet.* The knowledge surface already demonstrates the pattern
the app surface needs.

## 2. What diverges

68 distinct tokens across the 20 defining files:

| Class | Count | Meaning |
|---|---:|---|
| **agreed** | 41 | byte-identical everywhere — nothing to do |
| **cosmetic** | 2 | same rendered value, different notation (`#fff` vs `#ffffff`, `rgba(56,189,248,.14)` vs spaced) — normalising these changes **no pixel** |
| **visible** | 19 | genuinely render differently — **each needs a decision** |
| **surface** | 6 | legitimately per-surface — **must not be unified** |

The six surface-specific tokens are `--nav-h` (56 marketing / 58 app / 60
dashboard), `--side-w` (248 admin / 256 dashboard / 262 chat) and the four
`--fs-*` base sizes (marketing vs knowledge ladder). A 262px chat sidebar and a
248px admin sidebar are two design decisions, not one decision written down
inconsistently. Unifying them would be a regression.

## 3. The drift is concentrated in four files

Every visible divergence lives in one of these. The other 42 pages already agree.

| File | Visible tokens | Frozen? |
|---|---:|---|
| `dashboard.html` | 10 | no |
| `assets/knowledge.css` | 7 | no |
| `ai-monitor.html` | 3 | no |
| `reset-password.html` | 3 | no |

**No frozen file is affected.** `mock-exam.html`, `weakness.html` and
`focus.html` each define an inline `:root` and were checked individually: all
three already carry the majority value for every token. Normalising values
therefore needs **no unfreezing** (a structural refactor would — see §5).

Three single-use tokens should simply be deleted rather than reconciled — each
is a second name for a decision that already has one:

- `--border: #1a2640` (one page) — a near-miss of `--border-soft: #1a2540`
- `--font-sans` (one page) — duplicates `--font-body`
- `--radius-card: 16px` (one page) — sits between `--r-md` 14 and `--r-lg` 20

## 4. Decisions needed before anything changes

Majority is a reasonable default but it is **not automatically right**. Four
cases deserve an explicit call:

**(a) Font stacks — majority is arguably the worse value.** 18 pages declare
`'Manrope',sans-serif`; `assets/knowledge.css` declares
`'Manrope', system-ui, -apple-system, sans-serif`. The difference is only the
fallback chain, and the longer chain degrades better when the webfont fails.
*Recommendation: the fuller stack wins on merit, against the majority.* (The
design-system bundle already made this call for the same reason.)

**(b) `dashboard.html` translucency — 7 tokens, subtle but real.** It runs
`.3`/`.1` alphas where 13 other pages run `.32`/`.12`, plus `--cyan-bg-soft` at
`.08` vs `.1` and `--cyan-border` at `.26` vs `.28`. Visually near-invisible
individually; collectively it makes the dashboard read slightly flatter.
*Recommendation: adopt the majority.*

**(c) `--green` and `--red` — the largest visible jumps.** `#4ade80` → `#22c55e`
(knowledge.css, reset-password.html) and `#f87171` → `#ef4f5f`
(reset-password.html). These are noticeably different colours, and green/red
carry semantic weight (correct/incorrect). *Recommendation: adopt the majority,
but look at a rendered page first.*

**(d) `--purple` on `ai-monitor.html`** — `#a78bfa` vs `#a855f7`. An internal
ops page, so the stakes are low; unify for consistency.

**(e) `--r-xl` on `dashboard.html`** — 26px vs 24px. 2px on the largest radius.

## 5. Proposed mechanism — and why not a `<link>`

The obvious fix (delete the inline blocks, `<link>` one stylesheet) would change
loading behaviour: the app pages inline their tokens so the first paint is
already dark. Converting to an external request risks a flash of unstyled
content on a dark-themed product — trading a consistency bug for a visible one.

Instead, follow the repo's own established pattern. `taxonomy.core.js` is
authored once, synced into `taxonomy.js` by `scripts/sync-taxonomy.mjs`, and CI
fails on drift. `CLAUDE.md` names this the preferred way to share code and says
to prefer it over duplicating logic. Applied here:

1. `assets/tokens.core.css` — the single authored token source, plus a declared
   per-surface override set for the six surface-specific tokens.
2. `scripts/sync-tokens.mjs` — regenerates each page's inline `:root` from it,
   between explicit markers. Pages keep inlining; the bytes stop being authored
   by hand.
3. `scripts/validate-tokens.mjs` in `tests/run-all.mjs` — fails on drift, the
   same gate `validate-taxonomy` already provides. **This is the part that makes
   the fix durable**; without it the copies drift again.

This makes `assets/knowledge.css` a consumer of the core file rather than a
third opinion, and it is what turns the design-system bundle from "majority of
20 opinions" into "a copy of the one source".

**Sequencing:** §4's value decisions first (a small, reviewable diff touching 4
files), then the mechanism (a larger, structural diff touching all 20). Doing
them together would make a behaviour-changing diff indistinguishable from a
mechanical one.

## 6. Explicitly out of scope

- **Per-page inline app styling.** The 19 app pages embed far more CSS than
  their `:root` blocks — full component styling per page. That is a much larger
  duplication problem and is deliberately untouched here; it needs its own audit
  before anyone edits it.
- **Any UI or behaviour change.** This audit changed nothing. §4 is where the
  first pixel would move, and only on approval.
- **The frozen files.** Untouched, and §4 does not require touching them.
