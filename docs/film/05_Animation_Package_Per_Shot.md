# SI MATH AI — "THE AI COURT"
# ANIMATION PACKAGE — PER-SHOT GENERATION CARDS

Ready-to-run cards. Each names its references (Higgsfield IDs from `00`), its still prompt, its motion prompt, model and params, duration, and continuity notes. **Nothing here is generated from text alone — every card attaches locked assets.**

## REUSABLE BLOCKS

**[CHAR-LOCK]** — prepend to every still containing a character:
> Use the attached characters EXACTLY as referenced — identical faces, identical designs, identical costumes, identical proportions, identical painterly cartoon art style. Do NOT redraw, do NOT restyle, do NOT make realistic, do NOT change proportions, do NOT swap features.

**[WORLD-LOCK]** — prepend when attaching the Master Frame / environment bible:
> Match the attached courtroom exactly — same painterly hand-painted style, same architecture, same navy/cyan/gold palette, same emblem, same light direction, same lens language.

**[VID-LOCK]** — prepend to every motion prompt:
> Keep everything exactly as in the image — art style, characters, positions, architecture. Do not restyle, do not redesign anyone, do not add or remove figures. ONE camera move only.

**Standard refs:** MASTER = `0f0b8381` · ENV = `9bffde54` · JZ = `75f34868` · LZ = `4bc66c17` · REPS = `2508d506` · LOGO = `87ba9c49`

**Model split:** stills `nano_banana_pro` · non-dialogue motion `kling3_0` mode **pro** · dialogue `seedance_2_0` mode **std**, 1080p, `audio_references` = the recorded line, genre `drama` · finals `upscale_video` 4K. Generate 5s, cut to 3–4s. Decline all presets.

**The B-cut (used in Shots 5–11, generate ONCE, reuse):**
- Refs: MASTER + REPS. Still: 35mm, slightly high angle, the five at their table camera-right, warm gold exhibit light spilling across them from off-frame left, NOTHING igniting above them, painterly. Motion (kling pro): near-stillness — unison breathing, one slow head turn toward the off-screen light, gold spill flickering softly. 2s used.
- **Continuity:** exactly five. No hologram above them, ever.

---

## ACT I

### SHOT 1 · 0:00–0:03 · The Strike *(no line)*
- **Refs:** JZ + ENV. **Camera:** 85mm macro, bench height, locked.
- **Still:** [CHAR-LOCK][WORLD-LOCK] Extreme close-up of the elder judge's blue clawed hand resting beside a marble gavel with a gold band on the dark bench top, emblem glow soft in the bokeh background, dust in a light shaft.
- **Motion (kling pro):** the hand lifts the gavel and strikes once, decisively; dust jumps; the claw settles with a small weight-transfer afterward. Camera locked.
- **Audio:** the strike lands BEFORE first frame in conform. **Continuity:** gavel stays at the bench for the whole film.

### SHOT 2 · 0:03–0:07 · L1 "This court is now in session."
- **Refs:** MASTER + JZ. **Camera:** 50mm, from Center Court floor looking up, MCU, slow push-in.
- **Still:** [CHAR-LOCK][WORLD-LOCK] Judge Zero seated at the high bench, framed directly beneath the glowing emblem, low angle from the floor, calm authority, god rays behind.
- **Motion (seedance std 1080p + L1 audio):** he speaks the line slowly; eyes track left across the room BEFORE speaking; one blink AFTER the final word; beard settles; slow push-in.
- **Continuity:** glasses ON. Emblem centered above his head — this framing repeats in 13/15.

### SHOT 3 · 0:07–0:09 · MASTER — ✅ IN THE CAN (`010057d4`)
Use as cut; also the environment reference for every other card.

### SHOT 4 · 0:09–0:10 · L2 "Then let me ask a few questions."
- **Refs:** MASTER + LZ. **Camera:** 35mm, eye level, medium, low tracking arc left-to-right with him.
- **Still:** [CHAR-LOCK][WORLD-LOCK] Lawyer Zero standing at the warm-lit defence table camera-left, buttoning his jacket, folder in hand, facing the bench; grey table soft across the aisle right; Judge high in background.
- **Motion (seedance + L2):** he stands, buttons the jacket on the first word, steps out from the table with forward-weighted swagger, wings flick once, half-smile on the last word; camera arcs with him.
- **Continuity:** he exits toward CENTER COURT, not the aisle. Reps visible soft right.

## ACT II — each exhibit = A (line) + B (standard card above) + C (exhibit)

### SHOT 5 · L3 "…where the student went wrong?" · EXHIBIT A
- **A still refs:** MASTER + LZ. 50mm eye level medium: LZ in Center Court on the floor emblem, addressing the grey table (frame right), Judge above soft. **Motion (seedance + L3):** he delivers the line to the grey table, one claw raised, slow push.
- **C still refs:** MASTER. Hologram over the floor emblem: handwritten solution, `Step 1 ✓ / Step 2 ✓ / Step 3 ✗`, third step burning crimson, red spill on marble + reflections. **Motion (kling pro):** push in on Step 3 until red fills frame; energy veins surge; seal pulses.
- **Continuity:** crimson appears ONLY here and Shot 8's pattern echo. LZ watches the JURY (grey table), not the hologram.

### SHOT 6 · L4 "…why — instead of only saying 'wrong'?"
- **A:** 35mm medium-wide, WHIP-PAN from grey table to LZ (generate the two poles as stills; the whip is an edit/motion-blur transition in conform). Seedance + L4 on the LZ pole.
- **C:** the red step peels open like a case file revealing `ROOT CAUSE` beneath. Kling pro: peel + settle.

### SHOT 7 · L5 "A concept gap. A calculation slip. Carelessness. Or time?"
- **A refs:** MASTER + LZ. 35mm full shot, 180° orbit; LZ walks against orbit direction counting on claws; four gold icons snap in around Center Court one per beat (`CONCEPT GAP · CALCULATION SLIP · CARELESS ERROR · TIME PRESSURE`).
- **Motion:** seedance + L5; if orbit+walk fights the model, split: seedance MCU for the line, kling pro orbit for the icons, intercut.
- **Continuity:** cut lands on each beat in conform; icons remain visible through Shot 8.

### SHOT 8 · L6 "…the same mistake — for weeks?"
- **A/C combined refs:** MASTER + LZ. 24mm, fast pull-back: the single error multiplies across a glowing six-week timeline extending past both frame edges, `REPEATED 8× OVER 6 WEEKS`; LZ small beneath it.
- **Motion:** kling pro for the pull-back; seedance MCU insert for the line if the wide swallows it.

### SHOT 9 · L7 "Who turns one wrong answer into a plan?"
- **Refs:** MASTER + LZ. 50mm medium, LOCKED camera: the eight error points collapse inward and rebuild as an ordered practice structure (`FOCUS PRACTICE`) over the emblem; LZ still, warmer.
- **Motion:** kling pro (transformation) + seedance MCU (line). **Continuity:** first static A-cut — mark the tonal turn.

### SHOT 10 · L8 "Who knows what to study next?"
- **Refs:** MASTER + LZ. 50mm MCU rising with a single card `NEXT LESSON: QUADRATIC FUNCTIONS → FACTORING` lifting from the plan.
- **Motion:** kling pro rise + seedance line.

### SHOT 11 · L9 "…from the first question to the target score?"
- **Refs:** MASTER + LZ. 24mm crane ascending: luminous path unrolls from LZ's feet across the floor TOWARD THE BENCH, `FIRST QUESTION →→→ TARGET SCORE`.
- **Motion:** kling pro crane; seedance line as lead-in MCU. **Continuity:** path stays INSIDE the room, aimed at the bench.

### SHOT 12 · L10 "The defence rests."
- **Refs:** MASTER + LZ (+ REPS soft behind). 85mm MCU, LOCKED: LZ back to the grey table, facing the bench, straightens the tie once, finished smile.
- **Motion:** seedance + L10. **Audio:** music dies on the final word — protect in conform. **Continuity:** Reps in soft focus behind him, perfectly still.

## ACT III — Camera-2 axis, locked off, three sizes

### SHOT 13A · L11 "You are intelligent." — 50mm low MCU, locked. Business first: file closes, glasses off (two hands, silent), set down — THEN the line to the grey table. Seedance + L11.
### 13-insert *(1s, no line)* — 85mm slightly high: the five STAND together, unhurried, dignified. Kling pro. **Their only movement in the film.**
### SHOT 13B · L12 "But this one was built for students." — 85mm low CU, few-inch push. Eyes fully readable (glasses OFF from here to end). Hold 1s on the eyes before the line. Seedance + L12.
### SHOT 14A · L13 "It doesn't just solve math." — 24mm wide, orbit begins: every exhibit re-ignites into one orbiting constellation around Center Court; LZ inside the light. Kling pro + seedance line off-camera (JZ above).
### 14-insert *(1s)* — 85mm CU LZ's upturned face inside the light: the advocate becomes a student again. Kling pro.
### SHOT 14B · L14 "It understands how students learn." — 35mm MCU, orbit decelerates to rest on JZ seen THROUGH the orbiting holograms. Seedance + L14 (slowest read in the film).
### SHOTS 15A/B/C · L15/L16/L17 — three matched cuts on the Camera-2 axis: 35mm full → 50mm MCU → 85mm CU. Each law burns into the floor as spoken (`EVERY MISTAKE TELLS A STORY / EVERY STEP REVEALS A WEAKNESS / EVERY WEAKNESS BECOMES A PLAN`). Seedance per line; gavel lands on L17's last word. **Continuity:** identical cadence 15A/15B, half-step softer 15C; grey table visible in 15A edges.

## ACT IV

### SHOT 16 · L18 "Students don't need another chatbot."
- **Key frame:** RE-DERIVE from MASTER + JZ (the pending `860d393f` predates the Master Frame): JZ at the top of the five bench steps, robe trailing, cane planted, room beginning to darken at the edges.
- **Camera:** 35mm crane descending WITH him, full shot low. **Motion:** kling pro descent (cane→weight→step, never hurried) + seedance line; escalate to `motion_control` with a human reference walk if weight fails.
- **Continuity:** Reps FADE OUT during this shot — without defeat. Gavel and glasses stay on the bench.

### SHOT 17 · L19 "They need a mentor." — ⚠ THE FILM'S HEART
- **Key frame:** RE-DERIVE from MASTER + JZ + LZ: the two face to face on the floor emblem, each in his own shaft, room black beyond.
- **Camera:** 50mm eye level, slow 90° dolly to pure profile two-shot, shallow depth.
- **Performance:** stop → a beat of nothing → BOTH smile at the same moment. L19 spoken soft by LZ.
- **Pipeline:** attempt seedance + L19; **primary escalation `motion_control`** — film the beat as a human reference (two people, or one filmed twice), transfer the performance. **If the smile does not land: manual animation. Do not ship a mechanical smile.**

### SHOT 18 · Merge *(no line — never add one)*
- **Start frame:** the approved final frame of Shot 17. **Camera:** 50mm slow push through.
- **Motion (kling pro):** blue energy rises from the floor emblem in slow ribbons; robe and suit dissolve into light; two silhouettes drift together and become ONE Zero (match the young master `dd9c0935` silhouette, unclothed by either costume); he smiles once; black.
- **Negative:** not a teleport, not an explosion, no white flash, no electricity, blue only, slow throughout. **Continuity:** particles across the whole film drift UP; in this shot only, they drift INWARD toward the merge.

### SHOT 19 · Title card — build in the edit, not generated: gold `SI MATH AI / More than an AI. A complete learning journey. / simathAI.com` on black, one soft gavel tap, 1.5s hold minimum.

---

## CONFORM CHECKLIST (final edit)
- Cut picture to the VO read; the L10 music-cut silence and the 15-second merge quiet are protected
- Kling tails: drop the last ~1s of every clip
- Burned English subtitles; text inside central 80%
- Grade check per the Style Law — pause-test random frames
- Mix −14 LUFS; export 1080×1920 H.264 ~12 Mbps
- Full continuity pass against `02` checklist before delivery
