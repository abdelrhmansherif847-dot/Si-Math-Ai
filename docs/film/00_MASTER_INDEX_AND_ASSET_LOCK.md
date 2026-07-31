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
| `08_Approval_Gates.md` | The two gates every plate passes before it is LOCKED, plus the approval ledger |
| `09_Dialogue_Package.md` | All 19 lines: performance, expression, eye line, camera and shot — production-ready |
| `10_Continuity_Sheet_Spec.md` | Spec for the film's cinematography reference sheet (blocked on approval) |
| `11_Directors_Charter.md` | Laws 13–15, the performance standard, and the Silent Cut audit of all 19 shots |
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
9. **NEVER TRUST THE REQUESTED MODEL NAME.** The name you send is not the model that runs. After *every* generation, read the job's recorded `model` and confirm it. Stills must record `nano_banana_2` (request `nano_banana_pro` — see the ID shift below). A mismatch means the plate is void: discard it, do not "use it anyway," do not reason about whether it looks fine. This was proven by failure, and it cost three generations.
10. **TWO GATES.** A completed job is not an approved plate. Every plate passes **Gate 1 — Technical** (model, resolution, references, aspect ratio, settings) and **Gate 2 — Creative** (character identity, camera composition, courtroom geography, lighting continuity, emotional impact, storytelling purpose). **Only after both is a plate LOCKED.** Gate 1 is machine-checkable and is the operator's job. Gate 2 is the owner's eye and cannot be delegated, inferred, or assumed from a clean Gate 1. Checklists in `08`.
11. **LOCKED REFERENCES ONLY.** Never attach a `PENDING OWNER APPROVAL` asset to a production generation. A pending asset is an unvalidated design; making it the parent of a plate propagates it into the film through the back door. **No still becomes a parent reference for future generations until the owner has approved it visually.**
12. **UPSCALE APPROVED FRAMES — NEVER REGENERATE THEM.** Once a hero frame passes Gate 2 it is a fixed point, and every plate derived from it depends on it staying that way. To raise its resolution, **`upscale_image`** — same composition, same pixels, more of them. **Regeneration is permitted in exactly two cases: the composition itself is changing, or the frame was rejected at Gate 2.** Re-running a generation "identically" at a new resolution returns a *different image*, orphans every child derived from the original, and voids their approvals. Preserving continuity outranks native resolution. (Owner, 2026-07-31)
13. **THE DIRECTOR'S QUESTION.** Every decision answers one question: ***"Will this make the final film better?"*** — not "is this technically correct?" **Technical correctness is now a requirement, not the goal.** The goal is emotional storytelling. A choice that is flawless and inert loses to a choice that is imperfect and alive. (Owner, 2026-07-31)
14. **THE EMOTIONAL TIEBREAK.** When two options are both technically valid, **choose the one that creates the stronger emotional experience.** This film will be remembered for how it makes people feel, not for how perfect its prompts were. Use this to break every tie — it is not a preference, it is the deciding rule.
15. **THE SILENT CUT TEST.** Strip every line of dialogue from the film. **The audience must still understand the story** — from blocking, lighting, composition, performance and camera alone. Dialogue *strengthens* the story; it never *carries* it. Any shot that fails this test is under-designed, and the fix is visual, never a better line. Runs on every important scene before it is considered final. Storytelling order of responsibility: **blocking → performance → camera → lighting → music → dialogue** — dialogue is the final layer. Standing audit and the order in `11`.

> **Laws 13–15 outrank the rest.** 1–12 keep the film *consistent*; 13–15 decide whether it is
> *good*. When a consistency law and a director's law appear to conflict, the conflict is almost
> always a sign the shot is under-designed — solve it visually, do not trade away either one.

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

### ⏳ PENDING OWNER APPROVAL — the three re-used camera stills (generation order step 3)

All three derived from the Master Frame `0f0b8381` per `02` §5, requested on `nano_banana_pro`
(records as `nano_banana_2` — see the hazard note), 9:16, 2k, 1536×2752.

| Camera position | ID | Reused in | Refs |
|---|---|---|---|
| **Cam 2** — bench low angle, 50mm, glasses ON | job `e60f6a38-bd05-495a-8e69-740e280fbf13` | Shots 2, 13A, 13B, 14B, 15A/B/C | MASTER + JZ |
| **Cam 12/A** — Center Court toward bench, 50mm eye level, clean plate (no hologram) | job `6130e45b-2c39-4872-afbf-aed369d9d6d3` | Shots 4–12 A-cuts | MASTER + LZ |
| **B reverse** — grey table, 35mm slightly high, gold spill from off-frame left, nothing above them | job `f450ac37-4c4c-47fa-89e9-acb99dee42aa` | The Silence beat, Shots 5–11 | MASTER + REPS |

Deliberately generated from **locked references only.** The pose sheet and scale lineup were not
attached, because they are themselves still PENDING — attaching unapproved design to a production
plate propagates it into the film. Re-derive with them once they are approved, if wanted.

**Not yet verified visually.** The environment's network policy blocks the asset CDN, so these were
confirmed as completed jobs on the correct model but not inspected frame by frame. They need the
owner's eye against the `02` §6 continuity checklist before anything is built on them.

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

Camera stills rendered on the wrong model (`nano_banana_flash`, via the ID shift): `2d7ac26a` (Cam 2, 2k) · `f2e86fc3` (Cam 12/A, 2k) · `4bb0fb73` (Cam 2, 1k) · Semi-realistic dragon attempts: `7f6576ab`, `cc0b7019`, `57317d7c`, `be5d6d36` · Elder-in-suit concept (wrong casting): `67225483`, `78fbaa62`, `52858951`, `7832def7` · Judge alt: `e4b20885` · Lawyer alt: `7850214a` · Pre-final environments: `46bc7978`, `5f208353`, `403829ad`, `60c03826`, `d5cfd78f`, `a85530f3`, `661e1d4f`, `41ada558`, `26b4f25f`, `b2050555`, `d047a41e` · Old-style two-shots: `6854aae0`, `219d94fd` · Shot 3 alt: `39a96e55` · Reps alt: `8217bd6c`

---

## PRODUCTION STATE & NEXT ACTIONS

**Done:** world locked · cast locked (3 parties) · logo integrated · screenplay locked (19 lines) · blocking + coverage locked · Master Frame locked · **Shot 3 in the can** · pipeline researched and specified.

## THE PRODUCTION ORDER — owner-set, 2026-07-31

**Nothing jumps ahead of this order.** Each step is a foundation the next one stands on.

| # | Step | State |
|---|---|---|
| **1** | **Lock the four plates through Gate 2** | ⏳ **ACTIVE** — all four rendered, Gate 1 clean, awaiting the owner's eye |
| **2** | Upscale the approved Master Frame to 2K | blocked on 1 · call ready in Q1 |
| **3** | Generate the Continuity Sheet | blocked on 1 · spec complete in `10` |
| **4** | Cast and record the final voice actor | ⏳ **runs in parallel** — independent of 1–3, and the longest lead time. Booth script `07`, package `09` |
| **5** | Build the animatic with temporary timing | ✅ **v1 built** (`animatic.html`, owner directive 2026-07-31) — full story flow, all 40 cuts, temp VO + temp music. Refined against locked plates + real VO as they land |
| **6** | Begin animation | blocked on 5 |

Then, unchanged from `03` Part 4: per-shot key frames in script order · dialogue via Seedance 2.0
(audio-driven) · ambient motion via Kling 3.0 pro · Act IV last, Shot 17's smile via `motion_control`
or manual · `upscale_video` to 4K → conform → mix −14 LUFS → burned subs → deliver 1080×1920.

**Step 4 is the one to start now.** It is the only step whose blocker is a human being rather than an
approval, and it gates everything from step 5 onward.

## PRODUCTION STANDARDS

| Standard | Value | Set |
|---|---|---|
| **Still resolution** | **2K — 1536×2752** | Owner, 2026-07-31. Permanent baseline. The 1k Master Frame was a proof-of-concept and is explicitly *not* the standard |
| Aspect ratio | 9:16 (delivery 1080×1920) | Kit |
| Stills model | request `nano_banana_pro` → must record `nano_banana_2` | Law 9 |

## QUEUED ACTIONS — blocked on camera-package approval

Do not start these until all four camera plates pass Gate 2.

**Q1 · Bring the Master Frame to the 2K standard — by UPSCALE.** ✅ *Method decided by owner,
2026-07-31: upscale, never regenerate. Now Law 12.*

> **Call:** `upscale_image` · `image_id` `0f0b8381-fa06-427e-8f03-57df41598428` ·
> `width` 768 · `height` 1376 · `resolution` `2k` · provider `bytedance`
>
> Preserves composition, character placement, lighting, spatial geography, camera language and —
> critically — **parent-reference continuity**. Cam 2, Cam 12/A and the Grey Table Reverse remain
> valid children; their Gate 2 approvals survive.
>
> ⚠️ **The result still needs a narrow Gate 2.** An upscale cannot change composition, but it is not
> artifact-free — upscalers can hallucinate texture, over-sharpen edges, and distort fine features,
> faces worst of all. So the check is not "is this the right frame?" (already answered) but
> **"did the upscale damage anything?"** Look at the Judge's face, the emblem's linework, and the
> painterly brushwork — if it has been smoothed toward photographic, reject it and keep the 1k
> original, which is a better parent than a degraded 2K one.
>
> Sequencing: safe to run before or after camera-package approval, since it cannot invalidate the
> children. Held only because it produces a new asset the owner has not asked to exist yet.

**Q2 · Continuity sheet** — one page, the four camera positions. Spec in `10_Continuity_Sheet_Spec.md`.
Generated only after all four plates are LOCKED, since it *depicts* them.

**Q3 · No new camera positions** until the four are approved. These four are the visual language;
every later shot inherits from them. (Owner directive, 2026-07-31)

## OWNER AMENDMENTS LOG

Per the conflict rule at the bottom of this file, a newer document supersedes an older one **only**
through an explicit owner decision recorded here. All 2026-07-31:

| Amendment | Supersedes | Recorded in |
|---|---|---|
| L2 read speed → 165 wpm (2.55s) | `01` timing table's 130 wpm | `06` §4(b), `vo-lines.json` |
| Still resolution standard → 2K (1536×2752) | (gap — kit never specified) | `00` standards, `08` Gate 1 |
| Approved hero frames are upscaled, never regenerated | (gap) | Law 12, `08` upscale path |
| Director's Laws 13–15 | — (additive) | Laws, `11` |
| **Shot 13A/13B eyeline — the visual verdict.** L11 held on the Representatives; the slow gaze shift to Lawyer Zero before L12 *is* the verdict | `03`'s "straight down the lens" on 13A/13B | `09` L11/L12, `11`, `vo-lines.json` |
| Storytelling order: blocking → performance → camera → lighting → music → dialogue | — (additive) | Law 15, `11` |

## KIT DISCREPANCIES — RAISED, NOT PATCHED

Found while working the kit. Recorded here rather than silently corrected, because per the conflict
rule below only an explicit owner decision may supersede a document.

| # | Discrepancy | State |
|---|---|---|
| 1 | L2 priced at the Judge's 130 wpm though Lawyer Zero speaks it | ✅ **RESOLVED** — moved to 165 wpm (owner, 2026-07-31) |
| 2 | Shot 4 allots L2 one second against a 2.55s line, and Act II has zero slack to absorb it (22.5s speech + 5.5s silence = its full 28s) | ⏳ **OPEN** — either Shot 4 extends and Act II compresses, or L2 overlaps the Shot 4 → 5 cut. Affects the edit, not the read. See `06` §4(a) |
| 3 | `05` specifies stills on `nano_banana_pro`, but the Master Frame and all four reference sheets record as **`nano_banana_2`** | ✅ **RESOLVED — not a real deviation.** The tool's model IDs are shifted one tier against what the backend records (see the hazard note below). `05` is correct as written and the locked assets were made exactly as it specifies |

### ⚠️ OPERATIONAL HAZARD — the model ID shift

Verified by direct test on 2026-07-31, three generations:

| You request | The job records as |
|---|---|
| `nano_banana_2` | `nano_banana_flash` |
| `nano_banana_pro` | **`nano_banana_2`** |

Not a resolution or aspect-ratio effect — reproduced at both 1k and 2k.

**The rule: to match the locked assets, request `nano_banana_pro`. The job will record as
`nano_banana_2`. That is correct — do not "fix" it.** An operator who reads the job history, sees
`nano_banana_2` on the Master Frame and requests that ID will silently render on `flash` instead.
That is precisely how drift enters a locked pipeline, and it cost three wasted generations here.

**Verify after every still:** the job's recorded `model` must read `nano_banana_2`. If it reads
`nano_banana_flash`, the plate was rendered on the wrong model — discard and re-run.

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
