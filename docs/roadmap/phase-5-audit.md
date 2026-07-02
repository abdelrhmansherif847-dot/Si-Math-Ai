# Phase 5 — Authoritative Taxonomy Consumer Inventory

This Final Platform Audit **supersedes the original M0 audit**. It corrected one
misclassification (`dashboard.html`) and discovered three previously-unaudited
consumers (`dashboard.html`, `history.html`, `admin.html`).

## Consumer matrix
| Component | Consumer | Compliant | Status | Risk |
|---|:--:|---|---|:--:|
| `chat.html` | yes | display+write canonical | Complete | H |
| `progress.html` | yes | display via compat | Complete (guard → FU-7) | M |
| `taxonomy-write.js` | yes | canonical write boundary | No Change | L |
| `mastery-updater.js` | yes | writes via TaxonomyWrite | No Change | L |
| `exam-mistakes-logger.js` | yes | canonical | No Change | M |
| `taxonomy-compat.js` | temp | isolated compat layer | Complete (removal = criterion) | L |
| `taxonomy.js` / `_shared/taxonomy.core.js` | generated | drift-guarded projection | Complete | L |
| `regenerate-reports.js` | yes | write ✅; agg on raw names | Deferred **FU-2** | M |
| `weakness.html` | yes | display + weakness/rank agg on raw names | Deferred **FU-3** | H |
| `dashboard.html` | yes | display + agg/rank on raw names (corrected from M0 Group D) | Deferred **FU-4** | H |
| `history.html` | yes | raw-name display + local guard | Deferred **FU-5** | M |
| `admin.html` | yes | admin analytics counts by raw name | Deferred **FU-6** | L |
| `focus.html` | yes | legacy `subtopicsFor` | Pending (M3, frozen) | H |
| `mock-exam.html` | yes | heaviest legacy surface | Pending (M3, frozen) | H |
| `ai-tutor/index.ts` (Edge) | yes | canonical resolver + write; `fallbackRules` = educational content (not taxonomy) | Complete | H (deploy) |
| `taxonomy.core.js` (source) | source of truth | legacy name-API still present | Pending (M5 removal) | H |

## Non-consumers → No Change Required
`index.html` (landing), `profile.html`, `settings.html`, `login.html`, `signup.html`,
`reset-password.html`, `onboarding.html`, `devices.html`, `pricing.html`,
`manual-payment.html`, `ai-monitor.html`, `nav.js`, `chat-renderer.js`,
`xp-updater.js`, `assets/streak.js`, `focus-templates.js`. None touch topic/subtopic taxonomy.

## Database layer
- **Partial-canonical** (`*_id` present, partly populated): `question_records`,
  `mastery_records`, `weakness_reports`, `weakness_signals`, `focus_tasks`.
- **Legacy-only** (no `*_id`): `exam_mistakes`, `resources`, `response_feedback`,
  `session_questions`.
- → Deferred: historical `*_id` backfill (underpins FU-2/FU-3/FU-4/FU-6).

## AI-tutor formula map — determination
`fallbackRules` (`index.ts` L226–245) is a topic-keyed dictionary of
`{name, formula, desc}` LaTeX reference content shown to students. It is
**educational / pedagogical content**, not taxonomy infrastructure (no IDs, does
not resolve or store taxonomy). **Not a Phase 5 issue — no follow-up.**

## Remaining Phase 5 implementation work
- `focus.html`, `mock-exam.html` — M3 (frozen, per-file approval).
- `taxonomy.core.js` legacy name-API removal — M5.
- Deferred (behavior/backfill-dependent): FU-1..FU-7.
