# SI MATH AI — "THE AI COURT"
# CONTINUITY SHEET — SPEC (not yet generated)

**Status: BLOCKED on camera-package approval.** This sheet *depicts* the four camera plates, so
generating it before they pass Gate 2 would bake unapproved frames into the film's cinematography
reference — the exact failure Law 11 exists to prevent.

Everything about it is decided here. On approval it is one generation call, no further design.

**Purpose once it exists:** the cinematography reference for the entire film. Any later shot is
checked against this page. A shot that contradicts it is the shot that is wrong.

---

## THE FOUR CAMERAS — content of the sheet

Data below is final; it comes from `03` Part 2 and `02`. This is what gets rendered on the page.

### 1 · MASTER — the full court

| Field | Value |
|---|---|
| **Lens** | 24mm |
| **Height** | High — public gallery |
| **Angle** | Wide establishing, looking across the room toward the bench |
| **Movement** | Crane reveal |
| **Emotional purpose** | Geography in one image. Warm left, grey right, empty glowing centre. The audience learns the whole argument before a word is spoken |
| **Reused in** | Shot 3 · environment reference for **every** other plate in the film |

### 2 · CAM 2 — the bench

| Field | Value |
|---|---|
| **Lens** | 50mm base · 35mm and 85mm variants on the same axis |
| **Height** | Center Court floor, looking **up** |
| **Angle** | Low — authority. The Judge is always framed from below |
| **Movement** | Slow push-in (Shot 2) · locked off (Act III) |
| **Emotional purpose** | Authority, and later fairness. The emblem sits centred above his head so brand and character fuse in one image |
| **Reused in** | Shots **2, 13A, 13B, 15A, 15B, 15C** — 6 shots, 7 lines |

### 3 · CAM 12/A — Center Court toward the bench

| Field | Value |
|---|---|
| **Lens** | 50mm base · 24mm, 35mm and 85mm variants on the same axis |
| **Height** | Eye level — our advocate |
| **Angle** | From Center Court, Lawyer on the floor emblem, grey table frame right, Judge small and high behind |
| **Movement** | Tracking arc, orbit, pull-back, rise, crane — and **locked** at the two turning points (Shots 9 and 12) |
| **Emotional purpose** | Advocacy. The camera can't stay still around him — that restlessness *is* the character — so the two moments it stops are the moments that matter |
| **Reused in** | Shots **4, 5A, 6A, 7A, 8A, 9A, 10A, 11A, 12** — 9 shots, 9 lines |

### 4 · GREY TABLE REVERSE — the Silence

| Field | Value |
|---|---|
| **Lens** | 35mm |
| **Height** | Slightly high — they are subjects of the question |
| **Angle** | Reverse across the room onto the opposing table. Exactly five figures |
| **Movement** | Near-stillness — unison breathing, one slow head turn toward the off-screen light |
| **Emotional purpose** | **The film's argument.** Gold light falls on them from a source they cannot reach; nothing ever ignites above them. Not villains — simply not built for this. Never skipped |
| **Reused in** | The B-cut of Shots **5–11** — 7 Silence beats, 0 lines |

---

## GENERATION CARD — run only after all four plates are LOCKED

- **Model:** request `nano_banana_pro` → must record `nano_banana_2` (Law 9)
- **Resolution:** 2K · **Aspect:** 16:9 (a reference sheet, not a film frame — same exception as the character sheets)
- **References:** the four **approved** plates — `0f0b8381` (or its 2K successor per `00` Q1), `e60f6a38`, `6130e45b`, `f450ac37`
- **Layout:** 2×2 grid, one plate per cell, each captioned with camera name, lens, height, angle, movement, emotional purpose and reused shot numbers. Clean neutral dark grey background, professional cinematography reference layout
- **Prompt structure:** `[CHAR-LOCK]` + `[WORLD-LOCK]`, explicit `Do NOT` list, `THE ONLY CHANGE` clause — Law 3
- **Gate 1 then Gate 2** before it becomes the reference of record

⚠️ **If `00` Q1 resolves as *regenerate* rather than *upscale*,** the Master Frame changes, all three
camera plates must be re-derived and re-approved, and this sheet waits for that. If Q1 resolves as
*upscale*, the composition is preserved and this sheet can proceed on the approved four.
