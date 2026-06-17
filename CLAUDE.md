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
- `docs/roadmap/adaptive-verification.md` — Adaptive Verification Architecture blueprint
- `docs/roadmap/phase-0-verification.md` — Phase 0 verification document
