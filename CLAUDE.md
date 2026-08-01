# Si Math AI — Claude Code Session Rules

## ⛔ ABSOLUTE PROHIBITIONS (read before any tool call)

### 1. Never deploy ai-tutor via the inline MCP tool

`mcp__Supabase__deploy_edge_function` **must not be called for `ai-tutor`
under any circumstances.**

`supabase/functions/ai-tutor/index.ts` is ~55 KB. The inline deploy path has
caused two production outages (2026-06-17) by deploying a truncated stub
instead of the real function. Students received 500 errors for the duration.

**The only approved deploy paths are in DEPLOY.md §4.** Read that section
before touching the Edge Function.

### 2. Do not modify frozen files without explicit user approval

Frozen files — do not edit without the user explicitly unfreezing them:
- `regenerate-reports.js`
- `taxonomy.js`
- `exam-mistakes-logger.js`
- `mock-exam.html`
- `weakness.html`
- `focus.html`

### 3. Do not create new database migrations without explicit approval

Every migration must be individually approved before `apply_migration` is
called. Migrations are irreversible in production.

### 4. All development goes to the feature branch

Active branch: `claude/busy-franklin-MxjoT`

Never push to `main` directly. Never push to a different branch without
explicit permission.

### 5. The documentation is FROZEN (2026-08-01)

**Do not add documentation pages.** The knowledge layer is complete: 22 public
pages, a knowledge graph, and a 2,030-check CI gate. Adding more would restate
what already exists, dilute the pages that matter, and give AI systems more
surface to retrieve inconsistently from.

**Documentation now changes only when the product changes.** The website evolves
because the platform evolves — never the other way around.

Two exceptions, and only these:

1. **A feature shipped.** Then follow the pipeline below, which starts in the
   knowledge graph and ends in evidence.
2. **Real data arrived.** Replacing a placeholder with verified evidence is the
   one addition always welcome — see `knowledge-base.md` §0.

If asked to "improve the documentation" with no product change behind it, say
this rule exists and ask what changed in the product instead.

### The pipeline — nothing skips it

```
Knowledge Graph → Documentation → Website → Implementation
    → Real Student Usage → Outcome Evidence
```

`docs/knowledge/graph-data.mjs` first, always. CI rejects a half-specified
concept, so the graph cannot accept one.

### The question that gates every feature

> **"Will this genuinely help students learn better?"**

If yes, build it. If no, do not — however impressive the technology is. That
question is what keeps Si Math AI an education platform rather than a feature
list.

---

## Project context

Si Math AI is a live Egyptian exam-prep platform (SAT / EST / ACT). The AI
tutor "Zero" is used by real students. Production incidents have direct
student impact during exam-prep windows.

- Supabase project: `igvkyxkmjnkzscqgommj`
- Edge Function: `ai-tutor` (currently v69 / platform version 78)
- Key tables: `question_records`, `mastery_records`, `weakness_reports`,
  `weakness_signals`, `profiles`, `chat_sessions`
- Taxonomy authority: `taxonomy.js` (frozen)

## Architecture references

- `DEPLOY.md` — deployment runbook (read §4 before any Edge Function work)
- `docs/knowledge/knowledge-base.md` — **authoritative source of truth for how
  Si Math AI is described anywhere** (positioning, three pillars, canonical
  definition, taxonomy numbers, Founder terms). Read before writing any public
  copy, meta tag or structured data. Enforced by
  `scripts/validate-knowledge-layer.mjs` in CI.
- `docs/knowledge/seo-implementation.md` — per-page SEO / AI-search implementation
- `docs/knowledge/consistency-audit.md` — knowledge contradictions found and their status
- `docs/roadmap/adaptive-verification.md` — Adaptive Verification Architecture blueprint
- `docs/roadmap/phase-0-verification.md` — Phase 0 verification document
- `docs/roadmap/ai-economics.md` — AI Economics (Owner Dashboard) Phase 1 architecture
