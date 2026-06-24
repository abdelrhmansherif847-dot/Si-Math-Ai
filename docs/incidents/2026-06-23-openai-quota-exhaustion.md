# Incident Record — 2026-06-23 — OpenAI Quota Exhaustion

**Status:** Resolved (upstream billing restored)
**Severity:** High — AI Tutor could not generate tutored responses
**Component:** `ai-tutor` Edge Function → upstream OpenAI Chat Completions API
**Author:** AI Monitor investigation
**Classification:** Upstream provider failure (NOT an application code defect)

---

## Root cause (confirmed)

The outage was caused by **OpenAI quota / billing exhaustion**, proven by direct
production evidence from the `ai-tutor` Edge Function console log stream:

```
[ai-tutor] oai-no-content
{
  "ok": false,
  "status": 429,
  "err": "You exceeded your current quota, please check your plan and billing details."
}
```

OpenAI credit balance was independently verified as negative (-$0.09) during the
incident window. Every `ai-tutor` main-call to OpenAI returned HTTP `429` with no
usable completion content, across all input types (conversational, math text,
image) and over a multi-hour span.

This is an **upstream provider failure**. It is not caused by, and does not
implicate, any of the following — all of which were verified intact:

- Example A (judge final-answer injection / tutor-answer extraction)
- Example B (deterministic numeric equivalence in `solver_agreement`)
- Franco detection
- Reference resolution
- Parity fixes (`shadowQuestionText` / `shadowImageData`)
- Shadow verification pipeline (L3)
- Empty-answer guard
- AI Monitor

## What worked correctly

The **empty-answer guard performed exactly as designed.** When the upstream
OpenAI call returned no usable content (`!oaiRes.ok || !oaiContent`), the guard
floored the empty tutor answer to a localized `safeNoAnswerMessage(...)`, so the
backend never emitted `answer: ""`. Students received a safe, non-empty fallback
("…couldn't generate a full answer this time. Please resend…") instead of a hard
error. The guard converted an unrecoverable upstream failure into a graceful
degraded response.

## What was missing (the real gap exposed)

The platform had **no operational surfacing** of the upstream cause. Because the
HTTP status (`429`) and error reason exist only in the ephemeral Edge Function
console log — not persisted to any table and not readable by the AI Monitor
frontend — the system *appeared* broken while the application itself was healthy.
Significant time was spent auditing application code before the upstream quota
cause was discovered.

This is a **monitoring / telemetry gap**, addressed by:

- **Phase 1 (shipped):** AI Monitor "OpenAI Health" section using safe-message
  detection — surfaces guard activations, status (Healthy/Warning/Critical), and
  a critical banner. Honestly labels that exact error codes are not yet persisted.
- **Phase 2 (proposed, observability-only):** persist `oai_http_status`,
  `oai_error_code`, `oai_error_msg` from `ai-tutor` so the monitor can show the
  real 429 / 401 / 403 / 5xx breakdown.

> **Phase 2 is observability work only — NOT a fix for this outage.** Today's
> failure was upstream (billing); it was already handled gracefully by the
> guard. Phase 2 only makes the *cause* visible faster next time. It must not
> alter any `ai-tutor` behavior.

---

## Triage taxonomy — distinguish these three classes in all future analysis

When AI Tutor "looks broken," classify the cause into exactly one of:

### 1. Upstream OpenAI failures (provider-side — NOT our code)
Signature: `[ai-tutor] oai-no-content` with an HTTP status from OpenAI.

| Status | Typical `error.code` | Meaning | Operator action |
|--------|----------------------|---------|-----------------|
| `429`  | `insufficient_quota` | Quota / billing exhausted | Top up OpenAI billing |
| `429`  | `rate_limit_exceeded`| Too many requests | Back off / raise rate limit |
| `401`  | `invalid_api_key`    | Bad / revoked key | Rotate `OPENAI_API_KEY` secret |
| `403`  | `model_not_found` / access denied | No entitlement to model | Restore model access |
| `5xx`  | —                    | OpenAI provider outage | Wait / status.openai.com |

The application is healthy in all of these. The guard handles them.

### 2. ai-tutor code defects (our code)
Signature: errors NOT correlated with an OpenAI non-2xx — e.g. parse failures on
valid completions, regressions in Example A/B, Franco, reference resolution, or
the guard itself. These require a code fix and a DEPLOY.md §4 deployment.

### 3. Monitoring / telemetry gaps (visibility, not behavior)
Signature: the system behaves correctly but operators cannot *see* the cause —
exactly what this incident exposed. Fixed by observability work (Phases 1 & 2),
never by changing tutoring behavior.

---

## Timeline (UTC, 2026-06-23)

- ~11:33 — First `safeNoAnswerMessage` guard activations recorded (quota failures begin surfacing as safe fallbacks).
- 11:37–11:47 — Cluster of uncovered empty responses (pre-guard-coverage path).
- 14:10–14:46 — Further guard activations; `429 insufficient_quota` confirmed in console logs.
- 14:57 — Last successful tutored response recorded (upstream billing restored).
- Post-incident — AI Monitor Phase 1 "OpenAI Health" section added (safe-message detection).

## Action items

- [x] Phase 1 OpenAI Health monitoring (safe-message detection) — shipped.
- [ ] Phase 2 persistent OpenAI error telemetry (`oai_http_status` / `oai_error_code` / `oai_error_msg`) — proposed, awaiting migration + deploy approval. Observability-only.
- [ ] Consider an OpenAI billing-balance alert at the account level (outside this codebase).
