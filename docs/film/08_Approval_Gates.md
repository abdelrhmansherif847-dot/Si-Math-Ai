# SI MATH AI — "THE AI COURT"
# APPROVAL GATES — how a generation becomes a locked plate

**A completed job is not an approved plate.** Rendering successfully proves only that the service
returned an image. It proves nothing about whether that image belongs in this film.

Every plate passes two gates. **Only after both is it LOCKED** and eligible to be a parent reference
for anything downstream.

```
   generated  ──▶  GATE 1: TECHNICAL  ──▶  GATE 2: CREATIVE  ──▶  LOCKED
                   (operator, machine-        (owner, by eye,        (may now be a
                    checkable)                 mandatory)             parent reference)
                         │                          │
                         ▼                          ▼
                    fails → void,              fails → re-derive,
                    discard, re-run            log what was wrong
```

---

## GATE 1 — TECHNICAL · run by the operator

Machine-checkable against the job record. No judgement involved — every item is a fact you read back
from the completed job. **Do not advance a plate to Gate 2 with any box unticked.**

- [ ] **Correct model** — the job's recorded `model` reads `nano_banana_2` for stills.
      Request `nano_banana_pro`; the record must say `nano_banana_2`. If it reads
      `nano_banana_flash`, the wrong model rendered it → **void, discard, re-run.** (Law 9)
- [ ] **Correct resolution — `2k`, 1536×2752.** ✅ *Standard set by owner 2026-07-31.* Every
      production still is 2K. The 1k Master Frame was a proof-of-concept and is not the baseline.
      Any plate whose record reads `1k` fails this box.
- [ ] **Correct references** — the job's `input_images` are exactly the intended locked IDs, and
      **nothing marked PENDING is among them.** (Law 11)
- [ ] **Correct aspect ratio** — `9:16` for anything in the film; reference sheets may differ.
- [ ] **Correct generation settings** — no preset applied, prompt carries the `[CHAR-LOCK]` /
      `[WORLD-LOCK]` blocks and an explicit `Do NOT` list, no banned words. (Laws 2, 3)

**Gate 1 is falsifiable and cheap. Run it on every plate, every time, including re-runs.**

---

## GATE 2 — CREATIVE · owner only, mandatory

Cannot be delegated, inferred, or assumed from a clean Gate 1. A plate can be technically perfect
and creatively wrong — that is the normal case, not the exception.

- [ ] **Character identity** — strip the costume: is this the same Zero as the master? Face,
      proportions, linework, cel shading identical. Not a cousin, not a restyle. (Law 1)
- [ ] **Camera composition** — the lens, height and size the coverage card specifies, and the frame
      answers the six questions in `03`.
- [ ] **Courtroom geography** — Judge up-frame, Lawyer camera-LEFT, Representatives camera-RIGHT,
      exactly five of them, 180° line held, height hierarchy Seal > Judge > Lawyer > Reps,
      no hologram above the grey table. (Law 5, full list in `02` §6)
- [ ] **Lighting continuity** — same direction, same warm-left/cool-right split, same palette as the
      Master Frame. Gold is only Si Math AI.
- [ ] **Emotional impact** — does the frame *feel* like what the shot is for, or is it merely correct?
- [ ] **Storytelling purpose** — does it still pass The Sentence? *"This looks like a Disney or Pixar
      short film that just happens to be about education."* If it drifts toward "a really good AI
      advertisement," it is wrong even if every other box is ticked. (Law 7)
- [ ] **Silent Cut** — for any shot carrying a line: does the frame read **without** it? If the
      meaning only arrives with the dialogue, the shot is under-designed — fix it upstream through
      the storytelling order (blocking → performance → camera → lighting → music → dialogue), never
      by leaning on the line. (Law 15, `11`)

---

## THE UPSCALE PATH — a narrowed Gate 2

An **upscale of an already-approved plate** is the one case where Gate 2 does not restart from
scratch. Composition, blocking, geography and lighting were approved on the original and an upscale
cannot change them, so those boxes carry over.

**What does not carry over is artifact damage.** Upscalers hallucinate texture, over-sharpen edges
and distort fine features — faces worst of all — and a plate can come back higher-resolution and
*worse*. So an upscaled plate runs a short, specific Gate 2:

- [ ] **Face integrity** — character faces unchanged; no smoothing, no invented detail, no drift in
      the eyes or linework
- [ ] **Style preserved** — still painterly and hand-painted. **If it has been pushed toward
      photographic, reject it.** That is the Style Law failing, and it is the most common upscale
      failure mode
- [ ] **Emblem and text** — the Si emblem's linework and any on-screen text still clean
- [ ] **No new artifacts** — no haloing, no ringing on high-contrast edges, no plastic sheen

**Rejecting an upscale means keeping the original.** A clean 1k parent beats a degraded 2K one —
resolution is worth less than fidelity, which is the whole reason Law 12 exists.

Regeneration remains available in exactly two cases (Law 12): **the composition is changing**, or
**the frame was rejected at Gate 2.** Neither is "we would like more pixels."

## WHY BOTH GATES EXIST

Gate 1 catches the failure that has already happened here: a plate that rendered cleanly, looked
plausible, and was produced by the wrong model. Nothing about the image announced that. Only the job
record did.

Gate 2 catches everything Gate 1 structurally cannot — because "the references were correct" and
"the result honours the references" are different claims, and only an eye can confirm the second.

Neither gate substitutes for the other. A clean Gate 1 is not evidence for Gate 2.

---

## APPROVAL LEDGER

Every plate that will be used in the film. `—` means not yet assessed.

### The courtroom camera package

The four plates that define the camera language of the entire film. **Nothing downstream is generated
until all four are LOCKED.**

| Plate | ID | Gate 1 | Gate 2 | State |
|---|---|---|---|---|
| **Master Frame** | `0f0b8381` | ⚠️ pass at 1k | ✅ pass | 🔒 **LOCKED** — 2K upscale queued (`00` Q1, Law 12) |
| **Cam 2** — bench low angle | `e60f6a38` | ✅ pass · 2k | ✅ **pass** | 🔒 **LOCKED** |
| **Cam 12/A** — Center Court toward bench | `6130e45b` | ✅ pass · 2k | ✅ **pass** | 🔒 **LOCKED** |
| **Grey Table Reverse** | `f450ac37` | ✅ pass · 2k | ✅ **pass** | 🔒 **LOCKED** |

**Gate 2 finalized by owner directive, 2026-07-31** (*"Finalize Gate 2"* — the build-the-movie
order), after the plates appeared before the owner in two animatic screenings and a full-resolution
stills review with no objection raised. Standing safeguard: any plate may still be **rejected at
first-motion review** — Law 12's rejection clause then permits re-derivation. The film is the
source of truth; a plate that fails on screen fails, whatever this ledger says.

### Reference sheets

| Plate | ID | Gate 1 | Gate 2 | State |
|---|---|---|---|---|
| Judge expression sheet | `ac71e214` | ✅ pass | ⏳ awaiting owner | pending |
| Lawyer expression sheet | `a36e371d` | ✅ pass | ⏳ awaiting owner | pending |
| Two-character pose sheet | `4b77e84d` | ✅ pass | ⏳ awaiting owner | pending |
| Three-party scale lineup | `be214566` | ✅ pass | ⏳ awaiting owner | pending |

### Voided at Gate 1 — wrong model

| Plate | ID | Failure |
|---|---|---|
| Cam 2 (2k) | `2d7ac26a` | recorded `nano_banana_flash` |
| Cam 12/A (2k) | `f2e86fc3` | recorded `nano_banana_flash` |
| Cam 2 (1k) | `4bb0fb73` | recorded `nano_banana_flash` |

---

## AFTER THE CAMERA PACKAGE IS LOCKED

The four plates above **are** the courtroom camera language. Once locked they become the parent
references for every shot in the film, and the language stops being negotiable — a later shot that
contradicts them is the shot that is wrong.

Only then: dialogue shots, animation, final cinematic sequencing.
