# Response finalization — architectural audit

**Date:** 2026-08-06 · **Status:** `DEFERRED` — finding accepted, refactor
deliberately not now. Owner decision, recorded below.

**Document type:** Architectural finding. Nothing here is implemented. No Edge
Function change is prepared, no deploy is made.

---

## 0. What triggered it

A student-visible report: *"Rules Used appears for some answers and is completely
absent for others."* The investigation found the cause, and then the cause turned
out to be an instance of something larger.

The distinction that matters:

> "Rules Used doesn't show" is a bug.
> **"There are five response exits and each builds its own response" is an
> architecture problem.**

---

## 1. The finding

**`ai-tutor/index.ts` has no canonical response finalization pipeline.** It is a
single ~2,100-line linear procedure with **five AI-response exits**, each
constructing its own response literal by hand. There is no `buildResponse()` and
no shared finalizer.

| Exit | Line | Form | `is_math` |
|---|---|---|---|
| **A** idempotency replay | 2696 | `return new Response` | `true` |
| **B** worksheet guard | 2928 | `return new Response` | `false` |
| **C** repeat / re-explain | 3270 | `return new Response` | **`true`** |
| **D** scope guard | 4066 | `return new Response` | `false` |
| **E** main | 4352 | `const studentResponse = new Response` | computed |

Exit E is worth noting for anyone auditing this again: it does **not** match a
`return new Response` grep, because the response is built into a variable first
and returned after the background work is queued. A search for exits that only
looks for the obvious form under-counts by one — and it is the one that matters,
because it is the only complete path.

Because control flow is linear, **each exit skips every step downstream of its
own line number.** That is the entire mechanism. No exit is "wrong" locally; the
shape of the file is what makes them diverge.

## 2. What each exit skips

| Path | normalizeRules | fallbackRules | difficulty default | fallbackHint | Taxonomy gate | Answer guard | Persist | Shadows | Telemetry flush |
|---|---|---|---|---|---|---|---|---|---|
| **A** replay | skips¹ | skips¹ | **re-implements** | skips¹ | skips¹ | skips | n/a | skips | ✅ runs |
| **B** worksheet | skips | skips | skips | skips | skips | skips | skips | skips | ✅ runs |
| **C** repeat | **skips** | **skips** | **skips** | **skips** | skips² | **skips** | updates parent | skips | ✅ runs |
| **D** scope | skips | skips | skips | skips | skips | skips | skips | skips | ✅ runs |
| **E** main | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ runs |

¹ Legitimate — replays a record normalized at write time.
² Inherits the parent's already-canonical topic.

**B and D are correct.** They return `is_math: false`, so the math invariants do
not apply to them. Their skipping is by design.

**C is the defect.** It is the only exit that claims `is_math: true` while
applying **zero** normalizers.

## 3. The invariants, and where each is enforced

| Invariant | Enforced at | Times | Violated by |
|---|---|---|---|
| `rules` non-empty | 4130–4133 | 1 | **C** — `rules: []` |
| `difficulty` defaults `Medium` | 4139 | **2** ⚠️ | **C** — `difficulty: ''` |
| `hint` non-empty | 4144 | 1 | **C** — `hint: ''` |
| `concepts` | main only | 1 | **C** — `concepts: []` |
| `is_math` coaching/ack demotion | 4118 | 1 | — |
| Canonical topic/subtopic | 4217 | 1 | — |
| Scope guard | 4020 | 1 | — |
| **Model-call telemetry** | **4585 (`finally`)** | 1 | **none** |

Exit C violates **four** invariants, not one. Rules Used is merely the visible
one — `difficulty`, `hint` and `concepts` are silently empty on the same turns
and nobody reported them.

**The ⚠️ is the tell.** Exit A re-implements `cleanDifficulty()` inline at line
2701 because no shared finalizer exists to inherit it from. An exit hand-rolling
a guarantee is the same shape as `chat.html`'s `normalizeRuleFormula`
re-implementing maths detection — see `chat-renderer-math-protection.md`. Two
unrelated components, one cause: **a guarantee with no single home gets copied,
and the copies drift.**

## 4. Reproduction (deterministic, not intermittent)

The **"Explain Simpler"** button sets `pendingFollowUpType='explain_simpler'`
(`chat.html:2309`), sent as `follow_up_type` (`:1300`); the server sets
`repeatType='re_explain'` and takes exit C. **Rules Used disappears every time.**

Same for typing *"I don't understand"*, *"explain again"*, *"solve it another
way"*, *"مش فاهم"*, *"اشرح تاني"*.

**"Similar Question"** sends *"Give me a similar SAT/ACT question on X"*, matches
no repeat detector, takes exit E — and **keeps** its rules. Two adjacent buttons,
opposite behaviour, which is why the symptom reads as random.

Secondary, narrower gap: on exit E, `fallbackRules()` is a **14-key substring
dictionary** returning `[]` on no match, against a taxonomy of 5 topics / 33
subtopics. A math question whose topic misses all 14 keys *and* whose model
output carried no usable rules still shows nothing.

## 5. The precedent that decides the fix

**One invariant already survives every exit: model-call telemetry.** It lives in
a `finally` (4584) wrapping the `try` at 2545, which encloses all four early
returns. The comment states the intent outright:

> *"Runs on every exit path, including the early guards and the error path, so
> spend is never under-reported because of where the handler returned."*

Someone hit this class before, recognised it, and solved it **structurally** for
telemetry — and only for telemetry. The response-shaping invariants sit inline at
4086–4147, mid-procedure, reachable only by exit E.

Same file, same class of hazard, two different treatments. The correct fix is
therefore not a second `fallbackRules()` call at exit C; it is one
`finalizeResponse(payload)` that every exit passes through, enforcing the math
invariants exactly once.

**A hypothesis that was wrong, recorded because it would have been the scarier
finding.** During the audit I expected exit C to be losing OpenAI spend: it does
call the model (`max_tokens: 2200`) and does call `recordModelCall`, and it
returns ~1,300 lines before the flush. It is **not** losing spend — the `finally`
catches it. Checked rather than assumed.

## 6. Decision

**Deferred. Do not implement `finalizeResponse()` now.** Owner decision,
2026-08-06:

- This is a whole-file touch on `ai-tutor`, which means an Edge Function deploy,
  production risk during exam-prep windows, and changes to the surface the Truth
  Engine will build on.
- It is a **dedicated architecture project, not a patch applied while fixing a
  bug.** Mixing the two is how a bug fix acquires deploy risk it did not need.
- **`Response Finalization Pipeline` becomes a core architecture task when the
  Truth Engine phase opens.**

**Interim rule, in force until then:** *any production bug receives the smallest
safe fix, never a broad architectural refactor.* Rules Used included — patching
exit C alone is the correct interim action if it is prioritised before the
architecture phase, provided the patch is recognised as interim and this record
is referenced.

## 7. Why this is not in a backlog file

Deliberate, and the alternatives were checked:

- `docs/roadmap/truth-system-v2-backlog.md` is a **frozen baseline**; its own
  header requires "an explicit written decision recorded as an amendment" to
  change. Adding a task to it *is* renegotiating a frozen input, and that
  decision belongs to whoever opens the Truth Engine phase — not to the audit
  that found the item.
- `docs/engineering/infrastructure-backlog.md` states its scope as platform and
  deployment work and **"Not Truth System work"**, kept separate so neither track
  distorts the other. This item is Truth-Engine-adjacent by the owner's framing,
  so it does not belong there either.

So it lives here, as a standalone finding, until the phase that owns it opens and
can accept it through the proper amendment.

---

**Two open tracks this audit separates, and the reason to keep them separate:**

| Bugs — smallest safe fix | Architecture — dedicated sprint |
|---|---|
| Rules Used missing on repeat turns | **Response Finalization Pipeline** |
| Any other production defect | Truth Engine · Verification · Confidence · AI Router |

Firefighting and rebuilding the engine are different activities. Doing them in
one commit is how each makes the other harder to review.
