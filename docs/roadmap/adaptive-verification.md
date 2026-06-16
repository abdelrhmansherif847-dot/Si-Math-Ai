# Adaptive Verification Architecture

**Status:** Future Roadmap
**Priority:** Low — implement only after:
1. AI Chat stabilization
2. Weakness Signals verification
3. Weakness Analyzer implementation
4. Focus Practice implementation
5. Real user usage data collection

**Do not implement any part of this until the above milestones are complete.**

---

## Overview

A premium accuracy system where verification depth increases automatically as question difficulty increases. Reserved for higher-tier subscriptions (Quarterly and Annual). Not enabled for all users by default.

---

## Verification Levels

### Level 1 — Current Standard (all users)
```
Solver → Self Verification → Confidence Score
```

### Level 2 — Premium Basic
```
Solver → Alternative Verification → Self Verification → Confidence Score
```

### Level 3 — Premium Advanced
```
Solver A → Solver B → Cross Check → Judge → Confidence Score
```

### Level 4 — Future Advanced Accuracy Mode (Premium only)
```
Solver A
Solver B
Solver C
Solver D
    ↓
Critique Round
    ↓
Consensus
    ↓
Judge
    ↓
Final Verification
    ↓
Confidence Score
```

---

## Adaptive Escalation Logic

The system automatically increases verification depth when any of these conditions are met:

- Question difficulty increases
- Confidence score drops below threshold
- Solvers disagree on answers
- Question contains multiple concepts
- Long reasoning chains are detected

---

## Architecture Design

### Core Pattern
**Router → Solver(s) → Verifier → Judge**

A cheap Escalation Router (~200 tokens, gpt-4o-mini) runs before any solvers. It classifies the question into a verification level and outputs `{level: 1|2|3|4, reason: "..."}`. Solvers then fan out based on level.

### Isolation Principle
This lives in a **new** edge function `ai-tutor-premium` — a sibling to `ai-tutor`, never a modification of it. The existing `ai-tutor` function continues serving all users unchanged. Free-tier users have zero exposure to this system.

---

## Feasibility Analysis

| Component | Feasible? | Notes |
|---|---|---|
| Escalation Router | ✅ Easy | Single classifier call, similar to existing `isMathTopic` |
| Parallel solvers | ✅ Easy | `Promise.all([solverA, solverB, ...])` in edge function |
| Critique round | ✅ Medium | Needs structured prompts + JSON contracts between agents |
| Consensus voting | ✅ Easy | Majority vote on final answer + judge tiebreak |
| Confidence score aggregation | ✅ Easy | Existing `confidence_before` field in `question_records` already supports this |
| Tier gating | ✅ Easy | `profiles.subscription_tier` check |

**Blockers:** none technical. Main concern is latency at Level 3–4.

---

## Cost Analysis

Current system prompt ~6K tokens, answer ~1.5K tokens. GPT-4o pricing at $2.50/$10 per 1M in/out tokens.

| Level | OpenAI calls | Est. tokens (in+out) | Cost/question | vs. baseline |
|---|---|---|---|---|
| L1 (current) | 1 × 4o-mini | ~7.5K | ~$0.003 | 1× |
| L2 | 2 × 4o-mini + 1 verify | ~18K | ~$0.008 | 2.7× |
| L3 | 2 × 4o solvers + judge + verifier | ~30K (4o) | ~$0.18 | 60× |
| L4 | 4 solvers + critique + consensus + judge + final verify | ~70K (4o) | ~$0.50 | 167× |

**Monthly cost projection** (Annual user, 300 questions/month, 70% L1 / 20% L2 / 8% L3 / 2% L4):
- Per user: ~$8/month

**Pricing implication:** Quarterly tier should net ≥$15/mo, Annual ≥$25/mo to maintain healthy margins after Stripe fees and Supabase costs.

---

## Latency Analysis

| Level | P50 latency | P95 latency | Notes |
|---|---|---|---|
| L1 | ~3s | ~6s | Current baseline |
| L2 | ~5s | ~9s | One parallel pair |
| L3 | ~8s | ~15s | Two solvers parallel, then judge |
| L4 | ~18s | ~30s | Four solvers parallel, then sequential pipeline |

**UX implication:** L3/L4 require a progress UI ("Solver A reasoning…", "Cross-checking…", "Judging…") otherwise users will assume it's hung.

**Mitigation:** stream intermediate results via SSE. Current edge function uses a single fetch — L3/L4 should switch to streamed responses for perceived speed.

---

## Recommended Implementation Phases

### Phase 0 — Foundations
- Add `subscription_tier` column to `profiles` (or confirm if already exists)
- Add nullable `verification_level` (int) + `verification_trace` (jsonb) columns to `question_records`
- New table `verification_runs` (run_id, record_id, level, solver_outputs, judge_output, agreement_score, latency_ms)
- Zero changes to existing tables/RLS

### Phase 1 — Escalation Router
- New edge function `verification-router` classifies a question into L1–L4
- Logs decisions for tuning; does not call solvers yet

### Phase 2 — Premium edge function (L1 + L2)
- New `ai-tutor-premium` function — clone of L1 logic + L2 path
- Frontend: if `profile.subscription_tier in ('quarterly','annual')` → call premium endpoint
- Free users continue hitting `ai-tutor` unchanged

### Phase 3 — L3 multi-agent
- Parallel Solver A (gpt-4o) + Solver B (gpt-4o, different prompt strategy) + Judge
- Agreement detection (string/numeric normalization of `final_answer`)
- Stream stage updates to client

### Phase 4 — L4 consensus
- Four solvers with deliberately diverse prompting strategies (algebraic, geometric, plug-in-numbers, working-backwards)
- Critique round (each solver reviews one other's work)
- Judge final + verifier pass

**Recommended rollout:** ship L2 to premium users first — biggest accuracy gain per dollar — then observe real disagreement rates from L2 logs before committing to L3/L4.

---

## Integration with Existing Systems

| System | Integration approach | Risk |
|---|---|---|
| **Zero AI Tutor** | Solvers run "naked" (pure math); Zero personality applied only to the judge's final answer at render time | Low |
| **Hint Mode** | L1 only — hints are Socratic, not answers. Verification doesn't apply here. | None |
| **Confidence Tracking** | New aggregated confidence = f(solver_agreement, judge_confidence). Stored in `verification_runs.agreement_score`. Existing `confidence_before` untouched. | Low |
| **Question Records** | Add nullable `verification_level`, `verification_trace`. Existing reads ignore them. | Low (additive only) |
| **Weakness Signals** | Solver disagreement on a topic → strong weakness signal → `weakness_signal=true`. Augments, does not replace existing logic. | Low |
| **Dashboard** | Optional "Verified by L3 ✓" badge on premium answers. Existing counts and queries unchanged. | None |
| **History** | Premium answers render with collapsible "Verification trace" panel. Free users see existing UI. | None |
| **DB Architecture** | Two new nullable columns + one new table. Zero changes to existing tables, RLS policies, or queries. | None |

---

## Open Questions (to resolve before Phase 0)

1. **Tier source of truth:** is subscription tier already stored in `profiles`, or only in Stripe webhooks? Must confirm before adding column.
2. **Streaming:** does the current frontend handle SSE? If not, L3/L4 UX needs separate scoping work.
3. **Solver diversity:** four GPT-4o instances with different prompts vs. true multi-provider ensemble (GPT-4o + Claude + Gemini). Multi-provider adds vendor complexity but boosts accuracy.
4. **L4 usage cap:** cap L4 per user/day to prevent cost spikes?
5. **Answer caching:** identical question within N hours → reuse verified result? Could significantly reduce premium cost.

---

## Summary

Architecturally sound and cleanly isolatable from existing code. Financially viable at proposed tier price points. Highest risks are L4 latency (mitigated by streaming) and cost spikes (mitigated by usage caps and caching). Zero risk to current users — free tier continues hitting `ai-tutor` unchanged.

**Do not start implementation until all five milestones listed at the top of this document are complete.**
