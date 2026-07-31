# SI MATH AI — "THE AI COURT"
# VO RECORDING LOG — Stage 0

**Status: CASTING PENDING OWNER DECISION. No production lines recorded yet.**

Stage 0 of the pipeline (`03`, Part 4) is *"Voice, before anything."* Nothing dialogue-bound
animates until all 19 lines exist, because **picture is cut to the read, never the reverse.**

This log holds: the casting question, the audition evidence, the per-line duration budget, and
(once cast) the job ID of every recorded line. Machine-readable twin: `scripts/film/vo-lines.json`.

---

## 1. THE CASTING QUESTION — the kit's own ⚠️ REVISIT

`01_Production_Script.md` → **VOICE CASTING** opens with *"one actor, one voice, two energies —
do not cast two people,"* then flags itself:

> **⚠️ REVISIT — Lawyer Zero is young again.** You chose *"same voice, different energy"* when both
> Zeros were the same age. Now that Lawyer Zero is the young Zero, a single 55–70 voice on both no
> longer fits the picture.

The kit ranks three options. Their TTS equivalents:

| Kit option | Rank | What it means with `seed_audio` |
|---|---|---|
| One actor with real range | **1 (kit's pick)** | **One `voice_id`, two parameter sets** — differentiated only by `speech_rate` / `pitch_rate` |
| Two actors, matched timbre | 2 | Two `voice_id`s, chosen to sound related |
| Same voice, no differentiation | 3 | One `voice_id`, identical params — the kit now warns this sounds "dubbed by his grandfather" |

**Option 1 is the Costume-Swap Law applied to audio:** one Zero, two life stages, the only change
being tempo and placement. It is also the only option that makes the Shot 17 / Shot 18 merge land
in the ear as well as the eye — the audience should half-recognise the voice before the picture
confirms it.

**Character briefs (locked, from `01`):**
- **Judge Zero** — 55–70, deep chest resonance, no vocal fry. Morgan Freeman's tempo × a tenured professor's precision. Never loud, angry, or selling.
- **Lawyer Zero** — 25–32, bright, forward placement, crisp consonants, momentum. Never smug, sarcastic, or mocking.

---

## 2. AUDITIONS — 11 takes, 3.3 credits

Two audition lines, each chosen to stress what the role is hardest at:
- **Judge — L12** *"But this one was built for students."* — the verdict; tests weight and word placement.
- **Lawyer — L5** *"A concept gap. A calculation slip. Carelessness. Or time?"* — four metronome beats; tests rhythm and momentum.

All takes: `seed_audio`, wav, 48 kHz. Judge takes at `speech_rate −20`. Lawyer takes at `speech_rate +15`.

### Judge Zero — L12 · target **3.11s**

| Voice | Duration | Δ vs target | Job ID |
|---|---|---|---|
| **Alistair** | **3.13s** | **+0.02** | `666df6f1-1f0c-4bcd-a979-ab87fbf9230c` |
| Mark | 2.47s | −0.64 | `de2d57cb-1b84-4973-a626-f4ae0b6d1c38` |
| Callum | 3.93s | +0.82 | `6c7174b9-02ac-4c8a-81e5-5847d9b0850e` |
| Arthur | 5.23s | +2.12 | `a8574fd3-0daf-48aa-8710-8d09f9d280a6` |
| Onyx | 5.43s | +2.32 | `f1af489a-2702-4247-9114-344e092d5357` |
| Gideon | 6.09s | +2.98 | `b8e1a152-c35d-4bc2-8863-d85cb9f651fd` |

### Lawyer Zero — L5 · target **3.27s**

| Voice | Pitch | Duration | Δ vs target | Job ID |
|---|---|---|---|---|
| **Leo** | 0 | **3.68s** | **+0.41** | `1c699a07-796c-4179-80b0-4053d183d027` |
| Callum | +3 | 5.08s | +1.81 | `56b9c43e-e523-4542-97d5-017258ea3cc0` |
| Mark | +3 | 5.61s | +2.34 | `7e802362-28e6-4a81-91af-b91f512fb970` |
| Julian | 0 | 5.65s | +2.38 | `bfc14c2c-b39c-424b-a263-2a0822445aae` |
| Onyx | +3 | 6.42s | +3.15 | `9d1f71d7-3626-4324-a1a2-85d2ceb7f52b` |

**Callum, Onyx and Mark carry both roles**, so they are the three live option-1 (one-voice) candidates.

### What the numbers do and don't say

Durations are **as-generated, including any head/tail padding** the model adds — conform trims that.
So treat them as a relative ranking of read speed, not as exact speech length.

**Timbre is not measurable here and is not mine to judge.** Whether a voice reads as a 55–70 elder
with chest resonance, or as a bright 25–32-year-old, has to be decided by ear. The durations tell you
which voices *can hit the film's tempo*; the preview links tell you which one *is Zero*.

Two things the data does say clearly:

1. **Arthur, Gideon and Onyx are too slow for the Judge.** They overrun a 3.11s target by 2–3s while
   already slowed to −20. To reach target they'd need a *positive* `speech_rate` — i.e. the character's
   "0.7× tempo" direction would have to be abandoned to make the timing work.
2. **The Lawyer's 165 wpm is the harder ask.** Only Leo lands near target. Extrapolating each voice's
   base rate, hitting 3.27s would need roughly `speech_rate` +29 (Leo), +79 (Callum), +97 (Mark/Julian),
   and **+126 for Onyx — beyond the parameter's +100 maximum.** Onyx cannot reach the Lawyer's tempo.

---

## 3. PER-LINE DURATION BUDGET

Targets are `words / wpm × 60`, using the act read speeds `01` specifies (130 / 165 / 135 wpm).
Summed per act they reproduce the kit's own measured-timing table **exactly** — 6.0 / 22.5 / 15.6 / 4.0
= **48.1s** against a 76s runtime. These are the kit's budget decomposed per line, not a new invention.

| # | Speaker | Words | wpm | Target | Shot |
|---|---|---|---|---|---|
| L1 | JZ | 6 | 130 | 2.77s | 2 |
| L2 | LZ | 7 | 130 | 3.23s | 4 ⚠ |
| L3 | LZ | 8 | 165 | 2.91s | 5 |
| L4 | LZ | 8 | 165 | 2.91s | 6 |
| L5 | LZ | 9 | 165 | 3.27s | 7 |
| L6 | LZ | 7 | 165 | 2.55s | 8 |
| L7 | LZ | 8 | 165 | 2.91s | 9 |
| L8 | LZ | 6 | 165 | 2.18s | 10 |
| L9 | LZ | 13 | 165 | 4.73s | 11 |
| L10 | LZ | 3 | 165 | 1.09s | 12 |
| L11 | JZ | 3 | 135 | 1.33s | 13A |
| L12 | JZ | 7 | 135 | 3.11s | 13B |
| L13 | JZ | 5 | 135 | 2.22s | 14A |
| L14 | JZ | 5 | 135 | 2.22s | 14B |
| L15 | JZ | 5 | 135 | 2.22s | 15A |
| L16 | JZ | 5 | 135 | 2.22s | 15B |
| L17 | JZ | 5 | 135 | 2.22s | 15C |
| L18 | JZ | 5 | 135 | 2.22s | 16 |
| L19 | LZ | 4 | 135 | 1.78s | 17 |

**Overrun rule (`01`):** if the read comes back long, take it out of the **beats in Act II** — never
out of Act III. The verdict's pauses are the film.

---

## 4. TWO TIMING DISCREPANCIES FOUND IN THE KIT

Raised, not silently patched — both need an owner call, and neither blocks recording.

**(a) Shot 4 gives L2 one second; the line needs ~3.2s.**
Shot 4 runs 0:09–0:10. L2 *"Then let me ask a few questions."* budgets at 3.23s. Act II cannot absorb
the overhang either: its speech (22.5s) plus its silence (5.5s) equals exactly its 28s length
(0:10–0:38), leaving zero slack. So either Shot 4 extends and Act II compresses, or L2 deliberately
overlaps the Shot 4 → Shot 5 cut. Overlapping is normal grammar and probably the intent — but it
should be a decision, since it changes how Shot 5's key frame is timed.

**(b) L2 is budgeted at the Judge's read speed.**
`01`'s timing table prices Act I's 13 words at 130 wpm ("JZ"), but 7 of those words are Lawyer Zero's.
At his own Act II speed of 165 wpm, L2 is 2.55s rather than 3.23s — which incidentally eases (a) by
0.68s. `vo-lines.json` currently carries the kit's stated 130 wpm so the manifest matches the document;
say the word and it moves to 165.

---

## 5. PRODUCTION SETTINGS (locked once casting is chosen)

```
model        seed_audio (ByteDance Seed Audio 1.0)
format       wav
sample_rate  48000
cost         0.3 credits per line → 5.7 credits for all 19

JUDGE ZERO   speech_rate −20  pitch_rate  0  loudness_rate 0   (0.7× tempo, low/chest/settled)
LAWYER ZERO  speech_rate +15  pitch_rate +3  loudness_rate 0   (1.2× tempo, forward/bright/crisp)
```

Per-voice `speech_rate` will be re-trimmed after casting so each line lands on its §3 target — the
figures above are the character direction, not the final calibration.

---

## 6. RECORD LOG — 19 LINES

Filled in as each line is recorded. `scripts/film/vo-lines.json` is the machine-readable twin;
its `job_id` fields are the ones that matter downstream — each becomes the `audio_references`
input to that shot's `seedance_2_0` call.

| # | Speaker | Line | Job ID | Duration | Status |
|---|---|---|---|---|---|
| L1 | JZ | This court is now in session. | — | — | not recorded |
| L2 | LZ | Then let me ask a few questions. | — | — | not recorded |
| L3 | LZ | Who knows exactly *where* the student went wrong? | — | — | not recorded |
| L4 | LZ | Who knows *why* — instead of only saying 'wrong'? | — | — | not recorded |
| L5 | LZ | A concept gap. A calculation slip. Carelessness. Or time? | — | — | not recorded |
| L6 | LZ | Who sees the same mistake — for *weeks*? | — | — | not recorded |
| L7 | LZ | Who turns one wrong answer into a plan? | — | — | not recorded |
| L8 | LZ | Who knows what to study *next*? | — | — | not recorded |
| L9 | LZ | Who walks the whole road — from the first question to the target score? | — | — | not recorded |
| L10 | LZ | The defence rests. | — | — | not recorded |
| L11 | JZ | You are intelligent. | — | — | not recorded |
| L12 | JZ | But this one was built for students. | — | — | not recorded |
| L13 | JZ | It doesn't just solve math. | — | — | not recorded |
| L14 | JZ | It understands how students learn. | — | — | not recorded |
| L15 | JZ | Every mistake tells a story. | — | — | not recorded |
| L16 | JZ | Every step reveals a weakness. | — | — | not recorded |
| L17 | JZ | Every weakness becomes a plan. | — | — | not recorded |
| L18 | JZ | Students don't need another chatbot. | — | — | not recorded |
| L19 | LZ | They need a mentor. | — | — | not recorded |

**On delivery of all 19:** re-measure each against its §3 target, apply the Act II overrun rule,
then unblock Stage 1 key frames and the Seedance dialogue passes.
