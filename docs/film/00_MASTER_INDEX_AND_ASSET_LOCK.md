# SI MATH AI — "THE AI COURT"
# PRODUCTION KIT · MASTER INDEX & ASSET LOCK

**Read this file first.** This kit is a complete handoff: any director — human or AI — continues production from here without designing, redesigning, or reinterpreting anything. The world, the characters, the script, the blocking, the coverage and the pipeline are decided. The remaining work is **direction, refinement, and production only.**

**The charter: ZERO redesigns. ZERO reinterpretations. ZERO visual drift.**

---

## KIT CONTENTS

| File | What it governs |
|---|---|
| `00_MASTER_INDEX_AND_ASSET_LOCK.md` | This file — asset manifest, the Laws, handoff instructions |
| `01_Production_Script.md` | The film: acts, art direction, character bible, colour script, courtroom spec, tone guardrails, legal guardrails |
| `02_Shot_List_Blocking_Bible.md` | Ground plan, 180° rule, height hierarchy, the third party, per-shot blocking cards, continuity checklist |
| `03_Directors_Cut_Screenplay_Coverage.md` | The 19 locked lines, per-line cinematography, performance direction, production pipeline |
| `04_Courtroom_Floor_Plan.html` | Top-down diagram — positions + camera placements for all 19 shots |
| `05_Animation_Package_Per_Shot.md` | Ready-to-run generation cards: refs, prompts, models, params, continuity per shot |
| `06_VO_Recording_Log.md` | Stage 0: casting decision, audition evidence, per-line duration budget, record log |
| `07_VO_Booth_Script.md` | The printable booth script — what goes into the room on session day |
| `../../scripts/film/vo-lines.json` | Machine-readable twin of the 19 lines — params, targets, job IDs |

---

## THE LAWS (non-negotiable, apply to every future asset)

1. **THE COSTUME-SWAP LAW.** There is one Zero, at two life stages, each with a master illustration. Every new Zero asset is produced by costume/pose/expression swap **from its master or its locked production design** — never invented, never reinterpreted. Strip the costume: what remains must match the master exactly.
2. **THE BANNED WORDS.** Never put these in any Zero prompt: *3D render, Pixar-quality, subsurface scattering, feature-animation production quality, realistic, sculpted, younger, older.* Each one is read by image models as permission to redesign. This was proven by failure, twice.
3. **THE PROMPT STRUCTURE.** Every character asset: `Costume/pose/expression swap only` → enumerate frozen features → explicit `Do NOT` list → `THE ONLY CHANGE: […]` → attach the locked reference.
4. **THE STYLE LAW.** Painterly, hand-painted, Arcane/Spider-Verse/premium-anime language. Pause any frame: if it could pass for live action or a photoreal render, it is wrong.
5. **THE BLOCKING LAW.** Judge up-frame on the bench (leaves it only in Shot 16). Lawyer camera-LEFT. The five Representatives camera-RIGHT, present in every wide and reverse. Exhibits ignite only over the floor emblem in Center Court. The camera never crosses the 180° line. Height hierarchy in every frame: Seal > Judge > Lawyer > Representatives.
6. **THE SILENCE BEAT.** Every exhibit's B-cut — the grey table, gold light spilling over them, nothing igniting above them — is never skipped. It is the film's argument.
7. **THE SENTENCE.** Every choice is tested against: *"This looks like a Disney or Pixar short film that just happens to be about education."* If a choice moves the film toward "a really good AI advertisement," it is the wrong choice.
8. **DERIVE, DON'T DESCRIBE.** Every new frame is generated from locked references (Master Frame + character designs), never from text alone. Text-only generation is how drift happens.

---

## ASSET MANIFEST

Asset IDs are Higgsfield job/media IDs — pass them directly as `medias[].value` in generation calls. URLs are for human viewing. **LOCKED = never regenerate without an explicit owner request.**

### 🔒 CHARACTERS — LOCKED

| Asset | ID | Notes |
|---|---|---|
| **Elder Zero — master art** | media `71f68c3c-ca5c-40d4-a978-9f3570b2c711` | Brand source of truth for the elder stage |
| **Young Zero — master art** | media `dd9c0935-e9dd-4b83-b1bf-3f85450eaef7` | Brand source of truth for the young stage (the caped illustration) |
| **JUDGE ZERO — production design** | job `75f34868-93c8-4884-ac6f-4fb88b793004` | Elder master + black/gold robe + cane. DESIGN LOCKED — FINAL |
| **LAWYER ZERO — production design** | job `4bc66c17-db87-4e29-9546-490f235107df` | Young master + charcoal suit, red tie, gold pin, folder. DESIGN LOCKED |
| **GENERAL AI REPRESENTATIVES** | job `2508d506-beaf-4e17-a42d-4fce8052e5f2` | Five identical faceless grey figures. LOCKED |
| **Official SiMath logo** | media `87ba9c49-4d98-447b-bd3f-a21f1c96ccfa` | Attach whenever the emblem must render exactly |

### 🔒 ENVIRONMENT — LOCKED

| Asset | ID | Notes |
|---|---|---|
| **Environment style bible** | job `9bffde54-24a1-4028-bac8-2bc0a96c8900` | Painterly courtroom w/ official emblem on wall + floor. Every environment shot derives from this |
| **THE MASTER FRAME (Shot 3 still)** | job `0f0b8381-fa06-427e-8f03-57df41598428` | All three parties in place. The layout/lighting/lens bible for the whole film |

### ✅ IN THE CAN — finished film material

| Shot | ID | Notes |
|---|---|---|
| **SHOT 3 — master crane reveal** | video `010057d4-5488-4bc5-aa87-9f1869cc9e6f` | Approved. 5s, cut to 3–4s in conform |

### 🎞 MOTION REFERENCES — approved tests (style/behaviour reference, not final film)

| Asset | ID |
|---|---|
| Judge Zero motion behaviour | video `feed5df0-3f50-4af5-abea-f1af8f6d35a5` |
| Lawyer Zero motion behaviour | video `98a70c5c-bcf5-4e3e-b830-22930a1d78da` |
| Courtroom ambient behaviour (seal pulse, particles) | video `d2e74e33-a7e9-4186-8668-2c166a6fe30b` |
| Representatives ambient behaviour | video `2a7a424a-9e8e-4015-9075-e38aac6d3dac` |

### ⏳ PENDING OWNER VERDICT — merge sequence tests (Act IV)

| Asset | ID | Question on the table |
|---|---|---|
| Descent key frame | job `860d393f-8a20-4e0a-92c7-689b0f63ac8c` (alt `0c4912d0`) | Pre-dates Master Frame — re-derive from it before production use |
| Meeting key frame | job `061aa991-ec3b-4144-b17a-18e1591db834` (alt `5ac6d416`) | Same |
| Test 1 — descent video | `5d711819-bc0e-4816-93df-7e845dceab8c` | Does AI hold the weight/cane/robe? |
| Test 2 — meeting/smile video | `55eef465-7776-482e-bff1-9361f4fceac1` | Does the smile land? If not → manual animation / motion_control |
| Test 3 — merge energy video | `7a25053e-a882-441d-b6ea-514541432705` | Warm two-flames feel, or VFX teleport? |

### ⏳ PENDING OWNER APPROVAL — reference sheets (generated under the Laws, awaiting sign-off)

| Asset | ID |
|---|---|
| Judge Zero expression sheet | job `ac71e214-de4e-498e-8724-c85257156e2f` |
| Lawyer Zero expression sheet | job `a36e371d-cf4c-4bd1-903e-364be8989886` |
| Two-character pose sheet | job `4b77e84d-0fcb-4342-b80c-f72996096260` |
| Three-party scale lineup | job `be214566-2084-47cd-987a-ba736eaa73e6` |

### 🎙 VOICE / AUDIO — Stage 0

Full detail in `06_VO_Recording_Log.md`; booth script in `07`. Nothing dialogue-bound animates until
all 19 lines exist.

| Item | State |
|---|---|
| **Casting decision** | ✅ **HUMAN VO** (owner, 2026-07-31) — one actor, both roles, alternating, single session. Resolves `01`'s ⚠️ REVISIT block. |
| **Actor / session date** | ⏳ not yet set |
| **The 19 production lines** | ❌ **NOT RECORDED** — awaiting the session |
| **L2 read speed** | ✅ amended to 165 wpm (owner, 2026-07-31); total speech 48.1s → 47.41s |
| TTS via `seed_audio` | retired to emergency-pickup only |
| Judge auditions (L12) | Alistair `666df6f1` · Mark `de2d57cb` · Callum `6c7174b9` · Arthur `a8574fd3` · Onyx `f1af489a` · Gideon `b8e1a152` |
| Lawyer auditions (L5) | Leo `1c699a07` · Callum `56b9c43e` · Mark `7e802362` · Julian `bfc14c2c` · Onyx `9d1f71d7` |

Auditions are casting evidence only — **not film material, not locked, never used as a final take.**

### 🗑 SUPERSEDED — DO NOT USE, DO NOT REFERENCE

Semi-realistic dragon attempts: `7f6576ab`, `cc0b7019`, `57317d7c`, `be5d6d36` · Elder-in-suit concept (wrong casting): `67225483`, `78fbaa62`, `52858951`, `7832def7` · Judge alt: `e4b20885` · Lawyer alt: `7850214a` · Pre-final environments: `46bc7978`, `5f208353`, `403829ad`, `60c03826`, `d5cfd78f`, `a85530f3`, `661e1d4f`, `41ada558`, `26b4f25f`, `b2050555`, `d047a41e` · Old-style two-shots: `6854aae0`, `219d94fd` · Shot 3 alt: `39a96e55` · Reps alt: `8217bd6c`

---

## PRODUCTION STATE & NEXT ACTIONS

**Done:** world locked · cast locked (3 parties) · logo integrated · screenplay locked (19 lines) · blocking + coverage locked · Master Frame locked · **Shot 3 in the can** · pipeline researched and specified.

**Next, in order (from `03`, Part 4):**
1. **Record all 19 VO lines** — ✅ route decided (human VO), booth script and per-line duration budget prepared in `06`/`07`. **Now blocked on casting an actor and booking the session.** Nothing dialogue-bound animates before this.
2. Generate + approve the three re-used camera stills from the Master Frame: **Cam 2** (bench low angle), **Cam 12/A** (Center Court toward bench), **the B reverse** (grey table).
3. Per-shot key frames in script order (cards in `05`), one approval at a time.
4. Dialogue shots via Seedance 2.0 (audio-driven), ambient/motion shots via Kling 3.0 pro.
5. Act IV last. Shot 17's smile: motion_control from a human performance, or manual animation.
6. Upscale keeps to 4K → conform → mix (−14 LUFS) → burned subs → deliver 1080×1920.

## KIT DISCREPANCIES — RAISED, NOT PATCHED

Found while working the kit. Recorded here rather than silently corrected, because per the conflict
rule below only an explicit owner decision may supersede a document.

| # | Discrepancy | State |
|---|---|---|
| 1 | L2 priced at the Judge's 130 wpm though Lawyer Zero speaks it | ✅ **RESOLVED** — moved to 165 wpm (owner, 2026-07-31) |
| 2 | Shot 4 allots L2 one second against a 2.55s line, and Act II has zero slack to absorb it (22.5s speech + 5.5s silence = its full 28s) | ⏳ **OPEN** — either Shot 4 extends and Act II compresses, or L2 overlaps the Shot 4 → 5 cut. Affects the edit, not the read. See `06` §4(a) |
| 3 | `05` specifies stills on `nano_banana_pro`, but the Master Frame `0f0b8381` and all four reference sheets were actually generated on **`nano_banana_2`** | ⏳ **OPEN** — an operator following `05` literally would generate against a different model than the one that produced the locked references. Confirm which is normative before Stage 1 key frames |

**Reference sheets — Law compliance verified.** All four `PENDING OWNER APPROVAL` sheets resolve as
completed jobs and each attaches the locked production designs as inputs (`75f34868` Judge,
`4bc66c17` Lawyer, `2508d506` Reps) with the required enumerate-frozen-features → explicit `Do NOT`
structure. They extend the locked designs rather than reinterpret them, per Laws 1, 3 and 8. They
still need the owner's eye — compliance is not approval.

## RULES OF ENGAGEMENT FOR THE NEXT OPERATOR (Claude Code or human)

- Treat every 🔒 asset as immutable. If a generation contradicts a locked asset, the generation is wrong.
- Never generate from text alone; always attach the locked references named in each `05` card.
- One shot at a time; owner approval before the next. The six questions (in `03`) gate every generation.
- Respect the model split: **Kling 3.0 `pro`** for non-dialogue motion · **Seedance 2.0 `std` 1080p + audio reference** for every spoken line · `motion_control` for performance-transfer escalations · `upscale_video` for finals. Kling `std` was for tests only.
- Decline every stylistic preset a tool suggests. Presets restyle; restyling is drift.
- On any conflict between documents: `00` (this file) > `03` > `02` > `01`. Newer supersedes older only through an explicit owner decision recorded here.
