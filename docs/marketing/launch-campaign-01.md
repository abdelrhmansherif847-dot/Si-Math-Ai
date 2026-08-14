# Si Math AI — Launch Campaign 01

## `NOTHING YOU GET WRONG IS RANDOM`

**Status:** Production-ready creative brief. Six pieces, Facebook ×3 + Instagram ×3.
**Prepared:** 2026-08-14
**Production tool:** Higgsfield (generation) → Canva/Figma (typography + logo lockup) → publish
**Scope:** This is an internal marketing record. It is **not** part of the frozen public
knowledge layer (root `*.html`, `docs/knowledge/`, `llms.txt`, `sitemap.xml`) and adds no
public page. All copy in it is written against `docs/knowledge/knowledge-base.md`, which
remains the authority on how Si Math AI may be described.

---

## PART 0 — What this campaign was built from (verified, not recalled)

Before a word was written, these were read out of the live repository:

| Input | Source | What it fixed |
|---|---|---|
| Logo | `assets/si-math-ai-logo.jpg` | Deep navy serif "SiMath" wordmark; rounded-octagon glyph containing a serif **S** with a **π** perched on its shoulder. Off-white ground. |
| Zero | `chat.html` → `DRAGON_MENTOR` (inline base64) | Zero is a **small blue/cyan chibi dragon**, not a robot and not a human tutor. Currently shipped at 40×40 px. |
| Palette | `assets/knowledge.css` | `--bg #050a14` · `--bg-elev-1 #0a1224` · `--cyan #38bdf8` · `--purple #a855f7` · `--green #4ade80` · `--amber #f59e0b` |
| Positioning | `docs/knowledge/knowledge-base.md` §1, §1a, §1b | Canonical definition, the three pillars, banned framings, published boundary |
| Product structure | `knowledge-base.md` §934–963 | AI Chat → Weakness Analyzer → Focus Practice → Mock Exams → Progress → Learning Memory |
| Free tier | `pricing.html` | "free plan with no credit card" — verified copy, safe to use in a CTA |

**Two assets the campaign needs that the repo does not yet have** — flagged, not invented:

1. **A high-resolution Zero master.** The only Zero in the codebase is a 40×40 px avatar,
   far too small to reference. The Zero renders in this campaign were generated *from the
   existing design* (blue-cyan chibi dragon, small horns, folded wings) — they are a
   render of the existing mascot, **not a redesign**. If a hi-res Zero master exists
   outside the repo, swap it in and regenerate; consistency of the mascot across the
   campaign matters more than any single frame.
2. **The brand typeface.** The wordmark is a serif; no webfont is pinned for marketing use.
   Type direction below specifies a class of typeface, and the final lockup should use
   whatever the brand actually owns.

---

## PART 1 — Three campaign directions

Three genuinely different answers to "how do we launch this", developed far enough to be
judged, not strawmanned.

### Direction A — **THE MACHINE ROOM** *(cinematic / dark AI)*

Si Math AI presented as serious infrastructure. Near-black navy void, a single cyan light,
mathematics rendered as architecture — lattices, filaments, data passing through structure.
No faces. No UI. The register of a chip launch or a Nothing / Framer film. Zero barely
appears; when he does he is a presence in the dark, not a character.

- **Strength:** Instantly premium. Nothing else in Egyptian exam-prep marketing looks like
  this — the category is saturated with yellow-and-red "احجز مكانك" flyers and smiling
  stock students. Pure ownable territory.
- **Weakness:** Cold. Beautiful abstraction that a struggling G11 student scrolls past
  because it isn't *about them*. Left alone, it drifts into exactly the "AI is the future"
  cliché the brief forbids.
- **Verdict:** The best **visual system** available to us. Not sufficient as a message.

### Direction B — **THE EVIDENCE** *(student pain / psychological)*

Built entirely from the physical artefacts of an Egyptian student's real life: the
crossed-out sheet, the 2am desk lamp, the stack of past papers, the same error in October
and again in February. The campaign doesn't argue — it reads the student's own evidence
back to them until they recognise themselves.

- **Strength:** The highest "that's literally me" rate of the three, by a distance. Costs
  us nothing in claims — we are describing the student's behaviour, not our results, which
  makes it fully compliant with the no-fabricated-proof rule. And it is un-copyable: it is
  specific to this student, this country, this exam.
- **Weakness:** Can slide into a sad documentary. Pain alone doesn't sell — it needs
  something to resolve into, or it's just an accurate description of misery.
- **Verdict:** The correct **emotional spine**. Needs A's visual language to feel premium
  rather than bleak, and needs the product reveal to land as relief.

### Direction C — **ZERO SEES IT** *(character-driven)*

Zero fronts the campaign as a character with a point of view — an intelligence that reads
what the student can't. Warm, shareable, high mascot equity, strong long-term brand asset.

- **Strength:** Memorability and affection. Mascots compound; a dragon that "knows your
  mistakes" is a story students retell to each other, which is the cheapest distribution
  there is.
- **Weakness:** Two serious ones. Mascot-led launches read as *kids' app*, which is fatal
  for G11–G12 students who are buying seriousness. And `knowledge-base.md` §1b explicitly
  bans "an AI tutor for students" on the grounds that it **reduces the platform to Zero** —
  a Zero-fronted launch walks the brand straight into its own banned framing.
- **Verdict:** Too expensive as the whole campaign. Extremely valuable as a **controlled
  accent** — and Zero withheld for two pieces makes his arrival in the third genuinely land.

---

## PART 2 — The decision

**Direction B is the spine. Direction A is the visual system. Direction C is the payoff.**

Not a compromise — a sequence. Each direction does the job it is actually best at:

```
B gives us the truth that stops the scroll      →  "you are repeating something"
A gives us the surface that earns the price     →  near-black, one cyan light, no clichés
C gives us the character students remember      →  Zero, held back until piece six
```

### The campaign platform

> ### NOTHING YOU GET WRONG IS RANDOM.

This is the thesis of the Weakness Analyzer stated as a human sentence. It works as a
teaser (ominous, curious, claims nothing), as a pain line (*your* wrong answers aren't
random — they repeat), and as a differentiator (an answer is an event; a pattern is
information). It survives translation into Arabic. And critically: **it is a claim about
the student, not about us** — so it needs no evidence we don't have.

### The strategic decision underneath it

The brief asked for "aggressive". The knowledge base bans superlatives, score guarantees,
fabricated proof and rankings. These are not in conflict, and resolving them is what makes
the campaign strong rather than merely loud:

> **The aggression comes from diagnosis, not from claims.**

"We are the #1 AI tutor" is a weak sentence that everyone writes and nobody believes.
"You made that mistake four times and nobody was counting" is a violent sentence, entirely
true, impossible for a competitor to copy without the diagnostic engine to back it, and it
requires zero substantiation because the student verifies it themselves in the two seconds
after reading it. **Truth is the most aggressive asset we have.** Spend it.

### The six-piece arc

| # | Platform | Codename | Job | Format |
|---|---|---|---|---|
| 1 | FB | **The Common Thread** | Curiosity — something is arriving | Cinematic video, 4:5, 15s |
| 2 | FB | **The Fourth Time** | Recognition — "that's literally me" | Carousel, 4:5, 6 cards |
| 3 | FB | **An Answer Disappears** | Differentiation + conversion | Cinematic explainer video, 16:9, 28s |
| 4 | IG | **Ignition** | Pure atmosphere — brand arrival | Reel, 9:16, 8s |
| 5 | IG | **Which 20 Minutes** | The knife — wasted time | Reel, 9:16, 12s |
| 6 | IG | **Zero Remembers** | The character reveal | Reel, 9:16, 15s |

Zero appears in **two of six** pieces (3 and 6), and leads only one. That is deliberate.

---

## PART 3 — The visual system (locked across all six)

**Ground.** `#050a14` near-black navy. Never grey, never pure black, never white-background.

**Light.** Exactly **one** active light source per frame: electric cyan `#38bdf8`. Discipline
here is what separates this from every other AI ad. Purple `#a855f7` only as a whisper in
deep shadow. Amber `#f59e0b` only on severity/warning beats. Green `#4ade80` only on
mastery/resolution beats — and it is the only warm-positive colour in the entire campaign,
which is what makes it mean something when it finally appears.

**The signature move: PHYSICAL → DATA.** Graphite becomes light. Handwriting unravels into
particles. Torn paper resolves into a ranked structure. This is the one visual idea the
campaign owns, and it is not decoration — it is literally what the product does: your
paper mistakes become structured signals. Every piece contains it at least once.

**Texture.** Real paper fibre, real graphite, real tungsten desk lamp, anamorphic glass,
volumetric haze, honest film grain. Shot, not rendered — even the abstract frames should
feel photographed.

**Type.** Serif display for the headline beats, echoing the wordmark. All-caps, tight
tracking, generous margins. Body/UI beats in a clean grotesque. Never more than **seven
words on screen at once**. Never centre-set a paragraph.

**Logo placement.** The AI models must never be asked to draw the logo — they will mangle
it. Every logo appearance is the real `assets/si-math-ai-logo.jpg`, composited in post,
knocked out to a single flat cyan `#38bdf8` or off-white for dark grounds. Reveal only on
the final beat, always on a clean plate with at least one logo-width of clear space.

**The anti-brief, enforced.** No stock students. No smiling. No laptop mockups. No robots.
No glowing brains. No circuit boards. No blue-glow HUD overlays. No graduation caps. No
lightbulbs. No hands reaching toward floating holograms. Any frame that could carry a
competitor's logo without changing meaning is a failed frame.

---

# PART 4 — THE SIX PIECES

---

## ▸ FACEBOOK POST 1 — "THE COMMON THREAD"

**Big idea.** Every wrong answer this student has ever written shares something. We built
the thing that can see it. Reveal nothing else — no features, no price, no screenshots.
The launch teaser as an accusation the student can't stop thinking about.

**Marketing objective.** Top-of-funnel curiosity and brand arrival. Establish the visual
territory before anyone knows what we sell. Success metric: saves, shares and comments
asking "what is this?" — **not** clicks.

**Exact hook** *(first line of caption — this is the scroll-stopper)*
> Every question you've ever gotten wrong has something in common.

**Exact on-screen text**
```
0.0 – 3.5s   [no text — image and sound only]
3.5 – 6.5s   EVERY WRONG ANSWER
             YOU'VE EVER WRITTEN
7.0 – 10.0s  HAS SOMETHING IN COMMON
10.5 – 13.0s WE BUILT THE THING THAT SEES IT
13.5 – 15.0s [LOGO]  SI MATH AI
             SAT · ACT · EST MATHEMATICS
```

**Caption**
```
Every question you've ever gotten wrong has something in common.

You just can't see it from inside your own notebook.

From in there it looks like one bad day. One stupid mistake. One question you
should have known. From the outside it looks like the same error, wearing a
different question each time.

Si Math AI is a learning platform for SAT, ACT and EST Mathematics.

It is not a question bank. You bring your own questions — from your book, your
class, your last mock, the sheet your teacher handed you yesterday. It solves
them with you, step by step. Then it does the part nobody has been doing.

It remembers.

Something is arriving.
🔗 si-math-ai.com

#SATMath #ACTMath #ESTMath #AmericanDiploma #Egypt #Grade12
```

**CTA.** Soft, teaser-phase: **"Something is arriving — si-math-ai.com"**. No "sign up now"
in piece one; the click we want here is curiosity, and asking for conversion before the
audience knows what this is wastes the mystery we just paid for.

**Visual concept.** Extreme macro on a handwritten equation in graphite on exam paper. A
single hard raking light. Halfway through, the pencil strokes begin to *unravel* — lifting
off the paper as fine cyan particles and thin data filaments that rise into the black.
Physical becoming information, in one unbroken shot. No cut to a product. No screen. The
entire film is one piece of paper and what happens to it.

**Format.** **Cinematic video, 4:5** (feed-optimised — 4:5 occupies maximum vertical real
estate in the Facebook feed without being cropped like 9:16 is).

**Higgsfield generation direction**
- Base plate already generated: `nano_banana_pro`, 4:5, 2K — *see PART 5, KV-01*
- Animate via **`seedance_2_5`**, image-to-video, `start_image` = KV-01 job id
- Duration 5s per segment × 3 segments, assembled in edit. Do **not** try to generate 15s
  in one pass — the particle motion degrades badly past ~6s and the drift becomes obvious.
- Motion prompt, segment 1: *"Extremely slow push-in on the handwritten pencil equation.
  Almost imperceptible camera drift. Dust motes float through the raking light. The paper
  fibres catch the light. Nothing else moves. Patient, held, cinematic."*
- Motion prompt, segment 2: *"The graphite pencil strokes begin to lift off the paper and
  unravel upward into fine luminous cyan particles and thin drifting filaments, rising like
  smoke into the dark space above. The paper beneath is left progressively blank. Slow,
  elegant, continuous. Camera holds."*
- Motion prompt, segment 3: *"The last cyan particles drift upward and dissipate into the
  near-black void. The frame settles into empty darkness with only faint haze remaining.
  Slow, final, quiet."*
- Negative guidance in every prompt: *no text, no lettering, no logos, no people, no hands,
  no interface, no screens.*

**Shot-by-shot**

| # | Time | Shot | Action | Text |
|---|---|---|---|---|
| 1 | 0.0–3.5 | Extreme macro, 85mm anamorphic, f/1.4 | Slow push on graphite equation. Dust in the light beam. | — |
| 2 | 3.5–7.0 | Same frame, held | Strokes begin lifting into cyan particles | "EVERY WRONG ANSWER YOU'VE EVER WRITTEN" |
| 3 | 7.0–10.5 | Slow tilt up following the particles | The rise, paper falling out of focus below | "HAS SOMETHING IN COMMON" |
| 4 | 10.5–13.0 | Particles dissipating into black | Void, haze, silence | "WE BUILT THE THING THAT SEES IT" |
| 5 | 13.0–15.0 | Clean black plate | Logo fades up, cyan, centred | [LOGO] + descriptor |

**Zero's role.** **Absent.** Deliberately. The mascot arriving in piece one would answer
the question the film is asking. Withholding him is what makes piece six work.

**Logo placement.** Final beat only, 13.0s. Centre-frame, knocked out to cyan `#38bdf8`
on the black plate, at 22% of frame width, with the descriptor lockup 40px beneath in
letterspaced caps. Fade up over 0.6s. It is the only moment of brand identification in the
entire piece — let it be clean and let it hold for a full 2 seconds.

**Aspect ratio.** 4:5 (1080 × 1350).

**Duration.** 15 seconds.

**Sound.** Near-silence for the first 3.5s — a genuine risk that pays off, because Facebook
autoplay muted means the *visual* has to carry the stop, and the students who unmute get
rewarded. Then: a single deep sub-bass swell rising under the particle lift, one soft
granular texture (like paper being brushed), and a single clean synth note landing exactly
on the logo. No music bed. No drums. No voiceover. Reference: the sound design of a
hardware launch film, not an ad.

**Editing / transitions.** No cuts between shots 1–4 — it should read as one continuous
take, which is why the segments must be generated to match at their boundaries and
cross-dissolved by 6–8 frames only. The only hard edit in the piece is the cut to black
before the logo. Text enters by opacity fade (0.4s) with no movement — motion on type
would cheapen it.

**What the student should feel.** Unsettled, then curious. Specifically: *"wait — is that
true about me?"* The piece should feel like being told something about yourself by someone
who has been watching more carefully than you have.

**Why it matters strategically.** It buys the brand its visual territory before it has to
compete on features. Everything in the category is loud, yellow and crowded; fifteen
quiet seconds of near-black with one cyan light is a positioning statement that costs
nothing to make and is very expensive for a competitor to follow. It also plants the
Weakness Analyzer's thesis before the student has heard the feature name — so when piece
three explains the engine, it lands as confirmation rather than as a claim.

---

## ▸ FACEBOOK POST 2 — "THE FOURTH TIME"

**Big idea.** It was never four mistakes. It was one mistake, four times, wearing four
different questions — and nothing in the student's life was counting. This is the "that's
literally me" piece, and it earns that by being specific enough to be uncomfortable.

**Marketing objective.** Mid-funnel. Convert brand awareness into personal recognition and
drive the first real traffic. Success metric: comment sentiment (self-identification, tags
of friends) and click-through.

**Exact hook**
> It was never four mistakes.

**Exact on-screen text** *(one line per card — carousel text must be readable at thumbnail size)*
```
CARD 1   OCTOBER.
CARD 2   DECEMBER.
CARD 3   FEBRUARY.
CARD 4   LAST TUESDAY.
CARD 5   FOUR QUESTIONS.
         ONE MISTAKE.
CARD 6   [LOGO]
         SI MATH AI READS THE PATTERN
         YOU CAN'T SEE.
         Start free →  si-math-ai.com
```

**Caption**
```
It was never four mistakes.

October — you dropped the negative when you distributed.
December — you dropped the negative when you distributed.
February — again.
Last Tuesday — same thing. Different question. Different chapter. Different
topic entirely.

You didn't fail four times. You failed once, four times.

And here's the part that actually costs you marks: nobody was counting.
Not your notebook — it only holds the working, not the pattern. Not your
teacher, who has sixty other students and four hours a week. And not you,
because from the inside every wrong answer feels like its own separate bad day.

Si Math AI counts.

You bring your own questions — your book, your class, your last mock. Zero
solves them with you, step by step. But every attempt also becomes a signal:
the Weakness Analyzer ranks your weak skills by how much they are actually
costing you, with a severity band on each, and Focus Practice builds your next
session out of exactly those skills.

Not more questions. Different questions.

مش إنك مش فاهم رياضة. إنت بتكرر نفس الغلطة — وحد ما قالكش.

Start free. No credit card.
🔗 si-math-ai.com

#SATMath #ACTMath #ESTMath #AmericanDiploma #Egypt #SATPrep
```

**CTA.** **"Start free. No credit card. → si-math-ai.com"** — the no-credit-card clause is
verified copy from `pricing.html` and removes the single largest hesitation for a student
who has to ask a parent before entering a card.

**Visual concept.** Forensic, not emotional. Four torn rectangles of exam paper laid in a
precise vertical column on matte black, each showing the same error struck through in
red-orange. The first three sit in shadow; the fourth is lit. A single fine cyan line
descends through all four, touching the identical error point on each — evidence being
connected. Card 5 pulls back to reveal the whole column as one object. Card 6 is a clean
black plate with the logo.

**Format.** **Carousel, 4:5, 6 cards.** Carousel is the correct instrument here because
the *swipe is the mechanic* — each swipe is another instance of the same failure, and the
audience physically performs the repetition the copy is describing. A video would deliver
the same information without making the reader complicit in it.

**Higgsfield generation direction**
- Base plate generated: `nano_banana_pro`, 4:5, 2K — *see PART 5, KV-03*
- Cards 1–4: generate as **variants of one plate**, not four separate prompts, so the paper
  stock, lighting and grain match exactly. Use `generate_image` with `count: 4` on the
  KV-03 prompt, then select four frames and grade them identically in post.
- Card 4 differs only by lighting: re-prompt with *"…the lowest sheet is lit by a cold cyan
  key light from directly above while the three above it fall into deep shadow…"*
- Card 5: `outpaint_image` on KV-03 to 4:5 with additional headroom, giving the pull-back
  reveal without a second generation drifting from the first.
- Card 6: no generation — a flat `#050a14` plate built in Canva with the real logo.
- Negative guidance throughout: *no printed text, no captions, no logos, no screens, no
  people, no hands.*

**Shot-by-shot.** N/A — static carousel. Card order is the structure and must not be
reordered by the scheduling tool; verify card sequence after upload.

**Zero's role.** **Absent.** This piece is about the student's evidence, not about our
character. Introducing a friendly dragon into a forensic sequence would break its tone
and, worse, would soften the accusation the piece depends on.

**Logo placement.** Card 6 only. Centred on flat `#050a14`, cyan knockout, 24% frame width,
with the CTA line 60px beneath. Cards 1–5 carry **no logo at all** — a small brand mark in
the corner of card 1 would tell the reader this is an advertisement before the hook has
landed, and the entire mechanism of this piece depends on the reader believing, for four
cards, that it is about them rather than about us.

**Aspect ratio.** 4:5 (1080 × 1350) for all six cards, consistent — a mixed-ratio carousel
crops unpredictably.

**Duration.** N/A (static).

**Sound.** N/A (static). If a Reel cutdown is made later, the sound is four identical
paper-drop hits at increasing volume, then silence on card 5.

**Editing / transitions.** N/A. The design constraint that replaces it: cards 1–4 must be
visually **almost** identical — same crop, same paper, same shadow — so that the swipe
feels like déjà vu rather than like new information. The only permitted variation is the
handwriting on the sheet and the lighting on card 4.

**What the student should feel.** Caught. A specific, slightly cold recognition — *"that
is exactly what happens to me and I have never once thought about it that way."* Then
relief that something is finally counting.

**Why it matters strategically.** This is the conversion engine of the launch. Piece one
buys attention; this one converts it into personal stake. It also does the heaviest
positioning work in the campaign without ever stating a feature list: by the end of the
caption the reader understands that Si Math AI is diagnostic rather than a question bank,
which is the single most important thing they need to understand and the hardest thing to
communicate. And the Arabic line is doing double duty — it lands the emotional blow in the
language it will actually be felt in, *and* it demonstrates a real product capability
(Arabic and Franco explanation) without claiming one.

---

## ▸ FACEBOOK POST 3 — "AN ANSWER DISAPPEARS"

**Big idea.** Concede the thing everyone thinks is the argument — yes, ChatGPT can solve
your math question — and then reframe solving as the cheapest thing an AI does. The
difference isn't the answer. It's what survives after the answer.

**Marketing objective.** Bottom-of-funnel differentiation and conversion. Answers the
objection that kills this category — *"why wouldn't I just use ChatGPT for free?"* —
before the student has to ask it. Success metric: click-through and account creation.

**Exact hook**
> ChatGPT can solve your math question. So can we. That's the least interesting thing
> either of us does.

**Exact on-screen text**
```
0.0 – 3.0s    ASK ANY AI A MATH QUESTION.
3.5 – 6.0s    IT WILL SOLVE IT.
6.5 – 9.5s    THEN IT WILL FORGET YOU ASKED.
10.0 – 13.0s  AN ANSWER DISAPPEARS.
13.5 – 17.0s  A PATTERN DOESN'T.
17.5 – 20.0s  EVERY ATTEMPT BECOMES A SIGNAL
20.5 – 23.0s  EVERY SIGNAL BECOMES A PLAN
23.5 – 26.0s  [LOGO]  SI MATH AI
26.0 – 28.0s  SAT · ACT · EST MATHEMATICS
              START FREE → si-math-ai.com
```

**Caption**
```
Let's be honest about something.

ChatGPT can solve your math question. So can we. Solving is the cheapest thing
an AI does in 2026 — and if a solved question is all you need, you genuinely do
not need us.

Here is what happens next, and it is the entire difference.

You ask a general AI a question. You get a clean answer. You close the tab.
Tomorrow you ask it something else. It has no idea you exist, no idea you have
made that same error three times, no idea which exam you are sitting or how
many weeks are left.

Si Math AI is built the other way round.

→ AI Chat solves it with you — step by step, in English, Arabic or Franco, from
   a photo if typing it out at 1am is too much to ask.
→ Every attempt becomes a signal, not just an answer.
→ The Weakness Analyzer ranks what is actually costing you marks — by skill,
   with a severity band on each one.
→ Focus Practice builds your next session out of that ranking.
→ Mock Exams put you under the real clock, and every mistake flows straight
   back into the analysis.

An answer is an event. A pattern is information.

And because specialists should say what they don't do: SAT, ACT and EST
Mathematics only. Not Reading. Not English. Not Science. Not essays. One
subject, done properly.

The course teaches. Si Math AI accelerates learning.

Start free. No credit card.
🔗 si-math-ai.com
```

**CTA.** **"Start free. No credit card. → si-math-ai.com"**

**Visual concept.** Two-act. **Act one:** a single cyan answer resolves beautifully out of
the dark — elegant, satisfying — and then simply dissolves, leaving nothing. Beat of empty
black. **Act two:** the same dissolution happens again, but this time the fading particles
*don't* disperse — they are drawn together, and they assemble into the campaign's fingerprint
key visual, a whorl whose ridges are made of thousands of tiny handwritten mathematical
marks. The visual argument is made before a word of copy: one version leaves nothing behind,
the other leaves a structure.

**Format.** **Cinematic explainer video, 16:9.** Landscape is right here and nowhere else in
the campaign: this is the explanatory piece, it will carry the most reading, and 16:9 is the
ratio that survives being watched on a laptop, embedded on the site, and cut down for a
YouTube pre-roll later. The other five pieces are vertical; this one deliberately is not.

**Higgsfield generation direction**
- Fingerprint plate generated: `nano_banana_pro`, 4:5, 2K — *see PART 5, KV-05*. Regenerate
  at 16:9 for this piece, or `reframe` the existing plate to 16:9 to preserve the exact look.
- Act one plate: `nano_banana_pro`, 16:9 — *"A single handwritten mathematical solution
  rendered in fine glowing electric cyan light, suspended alone in a vast empty near-black
  navy void, sharply resolved at the centre of frame with enormous negative space around it,
  volumetric haze, shallow depth of field, no paper, no surface, no interface, no text
  captions, no logos."*
- Animate both acts with **`seedance_2_5`**, image-to-video, 5s segments:
  - Act one motion: *"The glowing cyan handwritten solution slowly loses cohesion and
    disperses outward into scattered particles that drift apart and fade into the black,
    leaving the frame completely empty. Elegant, unhurried, final."*
  - Act two motion: *"Scattered cyan particles drifting in dark space are drawn inward and
    downward, converging and organising themselves into the dense concentric ridges of a
    fingerprint whorl made of tiny mathematical notation. From chaos into structure.
    Continuous, deliberate, mesmerising. Camera slowly pushes in."*
- For the engine beat (17.5–23.0s), consider **`kling3_0`** instead — it holds multi-shot
  structure better than Seedance when a sequence needs to read as one continuous idea
  across a cut.
- Negative guidance: *no text, no lettering, no logos, no UI, no HUD, no robot, no brain,
  no circuit board.*

**Shot-by-shot**

| # | Time | Shot | Action | Text |
|---|---|---|---|---|
| 1 | 0.0–3.5 | Wide, centred, vast negative space | A cyan solution resolves elegantly out of the dark | "ASK ANY AI A MATH QUESTION." |
| 2 | 3.5–6.5 | Hold | It sits there, perfect, complete | "IT WILL SOLVE IT." |
| 3 | 6.5–10.0 | Hold | It disperses and fades. Frame empties completely. | "THEN IT WILL FORGET YOU ASKED." |
| 4 | 10.0–13.0 | **Empty black. Nothing.** | Hold the emptiness for a full 3 seconds | "AN ANSWER DISAPPEARS." |
| 5 | 13.0–17.5 | Slow push in | Particles reappear and begin converging | "A PATTERN DOESN'T." |
| 6 | 17.5–23.0 | Continued push | The fingerprint whorl assembles from the notation | "EVERY ATTEMPT BECOMES A SIGNAL" / "EVERY SIGNAL BECOMES A PLAN" |
| 7 | 23.0–28.0 | Whorl settles, holds, dims | Clean plate, logo up | [LOGO] + descriptor + CTA |

The three seconds of empty black at shot 4 are the most important three seconds in the
campaign. Do not shorten them in the edit. The emptiness *is* the argument.

**Zero's role.** **Present but not personified.** During shots 5–6, as the pattern assembles,
Zero's silhouette is faintly visible in the deep background haze — reading the structure, not
addressing camera, never acknowledged by the copy. He is the intelligence doing the work, not
a mascot presenting a feature. If the composite doesn't read as *effortlessly* subtle in
review, cut him entirely: a half-visible mascot is worse than no mascot.

**Logo placement.** 23.0s, on the settled whorl as it dims to 20% opacity behind. Logo cyan
knockout, centred, 18% frame width. Descriptor and URL beneath. Holds for 5 full seconds —
this is the conversion piece and the URL has to be legible long enough to be typed.

**Aspect ratio.** 16:9 (1920 × 1080). Also cut a 4:5 version for feed placement using the
same footage centre-cropped; the compositions are centre-weighted specifically so this crop
is lossless.

**Duration.** 28 seconds.

**Sound.** A single sustained low drone throughout, shifting harmonically at shot 4 —
during the empty black the drone *drops out entirely* for about 1.5 seconds, so the silence
is felt physically. Then a low pulse enters as the particles converge, building in density
as the whorl assembles, resolving on one clean sustained note at the logo. Still no
voiceover — the copy is on screen and in the caption, and a voiceover would make this an
advertisement rather than a film.

**Editing / transitions.** Dissolves only, 8–12 frames. One exception: a hard cut to black
at 10.0s, on the beat, which is the only violent edit in the campaign and is what makes the
emptiness land. Text fades in at 0.4s, out at 0.3s, never overlapping the next line.

**What the student should feel.** Convinced, and slightly re-educated. Specifically: *"I had
been thinking about this completely wrong — I was comparing answers, and the answer was never
the point."* They should come away with a sentence they can repeat to a friend, which is
"an answer disappears, a pattern doesn't."

**Why it matters strategically.** This is the piece that survives the objection that
otherwise kills every paid AI-education product: free general AI. Meeting it head-on, and
conceding the part that is true, buys enormous credibility — a brand that says "if a solved
question is all you need, you don't need us" is trusted on everything it says afterwards.
It also does the specialisation work that `knowledge-base.md` §1b requires: publishing the
boundary (Math only, not Reading, not essays) is what makes the depth claim credible rather
than boastful. And it plants the course/platform relationship correctly — *the course
teaches, Si Math AI accelerates* — which protects the positioning from the most common
EdTech failure of getting that direction backwards.

---

## ▸ INSTAGRAM REEL 1 — "IGNITION"

**Big idea.** Eight seconds of pure atmosphere. No explanation, no features, no product.
The brand's visual signature — graphite becoming light — delivered as a single sensory
event that a student watches three times without knowing why.

**Marketing objective.** Reach and brand arrival on the platform where the audience actually
lives. Optimised for **completion rate and rewatch**, which is what the algorithm rewards and
what an 8-second piece can win outright. Success metric: watch-through >90%, saves.

**Exact hook** *(visual, in the first 0.6 seconds — Instagram gives you less than a second)*
The frame opens already mid-motion: cyan particles are *already* rising off the paper. No
build, no establishing shot. The viewer arrives after the event has started, which is what
stops the thumb.

**Exact on-screen text**
```
0.0 – 2.2s   [no text — motion only]
2.2 – 4.0s   EVERY WRONG ANSWER
4.2 – 5.8s   HAS A PATTERN
6.0 – 7.0s   YOU CAN'T SEE IT FROM INSIDE
7.0 – 8.0s   [LOGO]  SI MATH AI
```

**Caption**
```
Every wrong answer has a pattern.
You just can't see it from inside your own notebook.

SAT · ACT · EST Mathematics.
Bring your own questions.

si-math-ai.com

#SATMath #ACTMath #EST #AmericanDiploma #Egypt #Cairo #Grade12 #SATPrep #مراجعة_رياضيات
```

**CTA.** Link in bio only. No hard ask — this is a reach piece and a CTA overlay would cost
completion rate for clicks it was never going to get at eight seconds.

**Visual concept.** The vertical companion to FB1, but faster, hotter and framed for a
phone: the equation sits in the bottom third, the particle rise occupies the whole upper
two thirds, and that upper void is where the type lives. One continuous move. No cuts.

**Format.** **Reel, 9:16, 8 seconds.**

**Higgsfield generation direction**
- Base plate generated: `nano_banana_pro`, 9:16, 2K — *see PART 5, KV-02*
- Animate with **`seedance_2_5`**, image-to-video, `start_image` = KV-02, `duration: 5`,
  `aspect_ratio: "9:16"`, then a second 5s segment for the tail; trim to 8s in edit.
- Motion prompt: *"Fine luminous electric cyan particles and thin filaments lift continuously
  off the handwritten pencil equation in the lower third of the frame and rise upward through
  the entire vertical space, accelerating gently as they ascend, going soft and bokeh-rich
  toward the top. The camera drifts slowly upward following them. Volumetric haze. The paper
  below falls progressively out of focus. Continuous, elegant, unhurried but never static."*
- Generate **3 variants** (`count: 3`) and pick on the quality of the particle motion in the
  first 20 frames — that is the only part of this piece that determines whether it works.
- Negative guidance: *no text, no lettering, no logos, no people, no hands, no interface.*

**Shot-by-shot**

| # | Time | Shot | Action | Text |
|---|---|---|---|---|
| 1 | 0.0–2.2 | Vertical macro, equation lower third | Particles already rising, camera drifts up | — |
| 2 | 2.2–4.0 | Continued rise | Particles fill mid-frame | "EVERY WRONG ANSWER" |
| 3 | 4.2–5.8 | Upper void, bokeh | Particles softening into haze | "HAS A PATTERN" |
| 4 | 6.0–7.0 | Near-empty frame | Last motes drifting | "YOU CAN'T SEE IT FROM INSIDE" |
| 5 | 7.0–8.0 | Clean plate | Logo | [LOGO] |

**Zero's role.** **Absent.**

**Logo placement.** Final second, centred, cyan knockout, 26% frame width (larger than the
Facebook pieces — vertical video is watched smaller and the mark has to survive a thumbnail).
Positioned at 45% frame height, not dead centre, to sit above the Instagram UI overlay.

**Aspect ratio.** 9:16 (1080 × 1920). Keep all type inside the central 1080 × 1420 safe area —
Instagram's caption and action rail eat the bottom ~320px and the top ~180px.

**Duration.** 8 seconds. Short deliberately: under 10s the piece can loop invisibly, and a
seamless loop on a particle rise is genuinely hypnotic. Match the last frame to the first
so the loop is undetectable.

**Sound.** One rising synth swell, 8 seconds, resolving on the logo — designed to be
satisfying on loop rather than to have a beginning and an end. Add a fine granular texture
under the particles. **Do not use a trending audio track**: this is a brand-arrival piece and
borrowed audio would attach someone else's meaning to the first thing anyone sees from us.
Trending audio is correct for pieces 5 and 6, not this one.

**Editing / transitions.** Single continuous take, no cuts. Type fades in over 0.25s — faster
than the Facebook pieces, because Reels tolerate and expect quicker rhythm. Final frame
matches frame one for the loop.

**What the student should feel.** A small involuntary "…okay, that was beautiful." No
comprehension required. The piece's entire job is to make the *next* thing they see from this
account something they choose to watch.

**Why it matters strategically.** It establishes the visual signature on the platform where
this audience makes its decisions, at a cost of eight seconds of their attention. It also
performs the algorithmic function no other piece can: short, loopable, high-completion content
is what teaches Instagram who this account should be shown to. Pieces 5 and 6 inherit the
audience this piece buys.

---

## ▸ INSTAGRAM REEL 2 — "WHICH 20 MINUTES"

**Big idea.** Attack wasted time, not wrong answers. Every student in this audience studies
hard; almost none can tell you which part of it worked. The question is unanswerable with
the tools they currently have, and being unable to answer it is what makes the question stick.

**Marketing objective.** Mid-funnel recognition and share velocity. This is the piece
designed to be **sent to a friend** — the tag-a-friend mechanic is the cheapest distribution
available and it only fires on painfully specific truths. Success metric: shares and sends.

**Exact hook** *(spoken/on-screen at 0.0s, no build-up whatsoever)*
> You studied three hours yesterday.

**Exact on-screen text**
```
0.0 – 1.8s   YOU STUDIED 3 HOURS YESTERDAY.
2.0 – 3.4s   40 QUESTIONS.
3.6 – 5.6s   WHICH 20 MINUTES ACTUALLY MATTERED?
5.8 – 7.0s   YOU DON'T KNOW.
7.2 – 8.6s   YOUR NOTEBOOK DOESN'T EITHER.
8.8 – 10.6s  THAT'S THE QUESTION
             SI MATH AI WAS BUILT TO ANSWER.
10.8 – 12.0s [LOGO]  START FREE → si-math-ai.com
```

**Caption**
```
Three hours. Forty questions.

Be honest — which twenty minutes of that actually moved your score?

Most students genuinely cannot answer this. Not because they're lazy, they
just did three hours of work. Because nothing they're using is keeping track
of which parts were worth doing.

Si Math AI keeps track. You bring your own questions. Every attempt is read,
not just marked. The Weakness Analyzer ranks what's actually costing you marks,
and Focus Practice builds your next session out of exactly that.

مش محتاج مسائل أكتر. محتاج تعرف تذاكر إيه بالظبط.

Start free. No credit card. Link in bio.

#SATMath #ACTMath #EST #AmericanDiploma #Egypt #Grade11 #Grade12 #StudyTips #SATPrep
```

**CTA.** **"Start free. No credit card. Link in bio."** — plus the on-screen CTA at 10.8s.

**Visual concept.** Documentary reality, cut like a thriller. Real desk, real 2am, real Cairo
apartment, the student seen only from behind — never a face, never a smile, never a stock
photo. Fast cuts between the *artefacts* of wasted effort: the stack of finished sheets, the
clock, the calculator, the phone face-down. Then, on the final beat, the campaign's signature
move arrives for the first time in this piece — the stack of paper resolves into a ranked
cyan structure, and the chaos suddenly has an order.

**Format.** **Reel, 9:16, 12 seconds.** Faster cutting than anything else in the campaign —
this piece is deliberately the least "cinematic" and the most kinetic, because pain needs
urgency and because six identically-paced films would be a boring campaign.

**Higgsfield generation direction**
- Desk plate generated: `nano_banana_pro`, 9:16, 2K — *see PART 5, KV-04*
- Detail plates, generate as a batch (`generate_image_batch`, `nano_banana_pro`, 9:16):
  1. *"Extreme macro of a tall uneven stack of handwritten solved exam papers on a dark desk,
     lit by a single warm tungsten lamp from the side, deep near-black navy shadow behind,
     shallow depth of field, film grain, no text legible, no logos, no people."*
  2. *"Extreme macro of a scientific calculator on a dark desk at night, warm tungsten
     key light raking across the keys, most of the frame falling into near-black shadow,
     shallow depth of field, film grain, no logos, no brand names, no readable display."*
  3. *"Extreme macro of a phone lying face down on a cluttered desk at night, a thin cold
     cyan glow leaking from the edge of the screen against warm tungsten lamplight, deep
     near-black shadow, shallow depth of field, film grain, no logos, no interface."*
- Animate each with **`seedance_2_5`**, 5s, image-to-video, then cut down hard — you need
  roughly 1.2s from each. Generating short and cutting shorter is correct here; do not try
  to direct 12 seconds of continuous action.
- Final transformation beat: `seedance_2_5` from KV-04 with motion prompt *"The towering
  stacks of paper on the desk dissolve upward into an ordered vertical structure of glowing
  electric cyan horizontal bars of differing lengths, arranged like a ranked list, floating
  in the darkness where the paper was. From chaos into order. The warm lamplight fades as the
  cool cyan structure takes over the frame."*
- Negative guidance throughout: *no faces, no smiling people, no stock photography, no
  readable text, no logos, no brand names, no glossy advertising look.*

**Shot-by-shot**

| # | Time | Shot | Action | Text |
|---|---|---|---|---|
| 1 | 0.0–1.8 | Over-shoulder wide, student silhouette at desk | Slow push. The only warm light in a dark room. | "YOU STUDIED 3 HOURS YESTERDAY." |
| 2 | 1.8–2.6 | Macro, stack of finished sheets | Hard cut in | "40 QUESTIONS." |
| 3 | 2.6–3.4 | Macro, calculator | Hard cut | — |
| 4 | 3.4–5.6 | Macro, phone face-down, cyan edge glow | Hard cut, hold | "WHICH 20 MINUTES ACTUALLY MATTERED?" |
| 5 | 5.6–7.0 | Back to wide, student motionless | The stillness of not knowing | "YOU DON'T KNOW." |
| 6 | 7.0–8.6 | Macro, open notebook | Pages of working, no answers about the working | "YOUR NOTEBOOK DOESN'T EITHER." |
| 7 | 8.6–10.6 | Wide — the transformation | Paper stacks resolve into ranked cyan bars | "THAT'S THE QUESTION SI MATH AI WAS BUILT TO ANSWER." |
| 8 | 10.6–12.0 | Clean plate | Logo + CTA | [LOGO] + CTA |

**Zero's role.** **Absent.** The student's own exhaustion is the protagonist here; a mascot
would be an intrusion into a room that is supposed to feel private.

**Logo placement.** Final 1.4 seconds only, on a clean plate, cyan knockout, 26% frame width
at 45% frame height, with the CTA line beneath in white at 60% opacity. Not composited over
the desk footage — the transformation shot must not have a logo sitting on it.

**Aspect ratio.** 9:16 (1080 × 1920), type inside the 1080 × 1420 safe area.

**Duration.** 12 seconds.

**Sound.** This is the one piece where a **trending audio bed is correct** — something with a
tense, driving low pulse, chosen at posting time from what is actually trending in Egypt
rather than specified here, because trend audio has a shelf life measured in weeks. Under it:
a ticking clock, just audible, that **stops** on "YOU DON'T KNOW." Silence for 0.8 seconds.
Then the pulse returns for the transformation. A voiceover is optional here and only here —
a real Egyptian student voice, unpolished, reading the lines flat, would raise this piece
significantly. Do not use a synthetic voice or a professional VO artist; both would destroy
the documentary credibility this piece runs on.

**Editing / transitions.** Hard cuts only — no dissolves anywhere except the final
transformation, which is a 20-frame morph. Cuts land on the audio pulse. The 0.8s of silence
at 5.6s is the structural centre of the piece; everything before it accelerates, everything
after it resolves.

**What the student should feel.** Exposed, then relieved. And — this is the specific reaction
being engineered — the impulse to send it to the friend they study with, because the friend
does exactly the same thing.

**Why it matters strategically.** It attacks the pain point that has no competitor in the
category: everyone sells *more* practice, nobody addresses whether the practice was worth
doing. That is a completely undefended position and it is the exact thing the Weakness
Analyzer and Focus Practice were built for, so the promise and the product are the same
object. It also reframes the purchase decision away from volume — which is where a question
bank wins — and onto direction, which is where only we can win.

---

## ▸ INSTAGRAM REEL 3 — "ZERO REMEMBERS"

**Big idea.** Introduce Zero by having him refuse to be what the audience expects. He solves
the question in two seconds — dismissively, like it was the easy part — and then turns and
tells the student something about themselves. The mascot reveal doubles as the product's
sharpest feature demonstration.

**Marketing objective.** Brand-character establishment and bottom-funnel conversion. Gives
the campaign a face to be remembered by after five pieces of deliberate anonymity. Success
metric: profile visits, follows, link clicks.

**Exact hook** *(0.0s, on screen, over Zero's silhouette)*
> This is Zero. He'll solve your question in about two seconds.

**Exact on-screen text**
```
0.0 – 2.4s   THIS IS ZERO.
2.6 – 4.6s   HE'LL SOLVE YOUR QUESTION
             IN ABOUT TWO SECONDS.
5.0 – 6.6s   THAT'S NOT WHY HE'S HERE.
7.0 – 9.4s   "YOU'VE MADE THIS MISTAKE
              THREE TIMES."
9.8 – 12.2s  HE REMEMBERS EVERY QUESTION
             YOU'VE EVER BROUGHT HIM.
12.6 – 15.0s [LOGO]  SI MATH AI
             START FREE → si-math-ai.com
```

**Caption**
```
Meet Zero.

He'll solve the question you bring him — step by step, in English, Arabic or
Franco, from a photo if typing it out at 1am is too much to ask.

That's not the interesting part.

The interesting part is that he remembers the last one. And the one before
that. And he can tell you that all three were the same mistake wearing three
different questions — which is something you would never have noticed on your
own, and which is exactly the thing that's been costing you marks.

Zero is a guide character, not a real person. And he doesn't invent the
teaching — he delivers methods that experienced educators built and review.

You bring the questions. He reads the pattern.

SAT · ACT · EST Mathematics.
Start free. No credit card. Link in bio.

#SATMath #ACTMath #EST #AmericanDiploma #Egypt #Cairo #SATPrep #Grade12
```

**CTA.** **"Start free. No credit card. Link in bio."**

**Visual concept.** Zero alone in a vast dark space, cinematic and premium — closer to a
character reveal in a game trailer than to a mascot in an education ad. A question drifts to
him as cyan light. He glances at it; it resolves instantly and dissolves — *the solving is
thrown away as trivial*. Then he turns his head toward camera, and behind him three faint
ghost-versions of the same error illuminate in sequence, connected by a single cyan thread.
He holds the look. That's the whole piece.

**Format.** **Reel, 9:16, 15 seconds.**

**Higgsfield generation direction**
- Zero master plate generated: `nano_banana_pro`, 9:16, 2K — *see PART 5, KV-06*
- **Character consistency is the critical risk in this piece.** Do not re-prompt Zero from
  scratch for each shot — he will drift. Either: (a) pass KV-06 as a `medias` reference on
  every subsequent generation, or (b) if Zero is going to recur across future campaigns,
  train a reusable **Soul** (`show_characters(action='train')`, 5–20 images, ~10 min) from
  the approved Zero renders. Option (b) is the right investment if this launch works.
- Animate with **`kling3_0`**, image-to-video — chosen over Seedance specifically because
  this piece needs a *character performance* across a head turn and a held look, and Kling
  holds multi-shot motion and character coherence better.
- Motion prompt, beat 1: *"The small cyan dragon stands still in the dark, breathing gently,
  looking slightly off camera. A glowing cyan handwritten equation drifts into frame beside
  him. He glances at it once, briefly, almost dismissively, and it resolves and dissolves
  into particles. Subtle, calm, confident."*
- Motion prompt, beat 2: *"The small cyan dragon slowly turns his head toward the camera and
  holds a direct, steady, knowing look. Behind him in the darkness, three faint glowing cyan
  fragments illuminate one after another and a single thin thread of light connects them.
  He does not move again. Held, quiet, slightly unsettling."*
- Generate the head-turn beat **3–4 times** and select. This is the single most failure-prone
  generation in the campaign; a mascot head turn that reads as uncanny or floppy will kill
  the piece, and it is worth the extra credits to have options.
- Negative guidance: *no text, no lettering, no logos, no other characters, no props, no
  clutter, no childish cartoon styling, no exaggerated cartoon expressions.*

**Shot-by-shot**

| # | Time | Shot | Action | Text |
|---|---|---|---|---|
| 1 | 0.0–2.4 | Wide, Zero small in a vast dark void | Zero standing still, breathing, backlit | "THIS IS ZERO." |
| 2 | 2.4–5.0 | Push to medium | Equation drifts in; he glances; it resolves and dissolves | "HE'LL SOLVE YOUR QUESTION IN ABOUT TWO SECONDS." |
| 3 | 5.0–7.0 | Medium, held | Beat of stillness. Nothing happens. | "THAT'S NOT WHY HE'S HERE." |
| 4 | 7.0–9.8 | Slow push to close | He turns his head to camera. Three ghost-errors light behind him, connected by a thread. | "YOU'VE MADE THIS MISTAKE THREE TIMES." |
| 5 | 9.8–12.6 | Close, held on the look | He doesn't move. The thread glows. | "HE REMEMBERS EVERY QUESTION YOU'VE EVER BROUGHT HIM." |
| 6 | 12.6–15.0 | Pull back to wide, dim | Logo up on the dark plate | [LOGO] + CTA |

**Zero's role.** **Lead — and this is the only piece where he leads.** The characterisation
is the entire point and it must be held precisely: Zero is *calm, attentive and quietly
knowing*, never silly, never bouncy, never waving, never giving a thumbs-up, never
"excited to help!". The moment he behaves like a cartoon assistant, the brand becomes a
kids' app and five pieces of accumulated seriousness are spent. He does not speak; the
line at 7.0s is his, rendered as on-screen text in quotation marks, which is more unsettling
than a voice and avoids committing to a voice casting decision this early.

**Logo placement.** Final 2.4 seconds, on the dimmed wide shot with Zero still faintly
visible in frame — the one place in the campaign where the logo and the mascot appear
together, which is what makes this the piece that closes the loop. Cyan knockout, 24% frame
width, centred at 45% height, CTA beneath.

**Aspect ratio.** 9:16 (1080 × 1920), type inside the 1080 × 1420 safe area.

**Duration.** 15 seconds.

**Sound.** Sparse and atmospheric — a low sustained pad, one soft chime on the equation
resolving, then near-silence for the head turn. The three ghost-errors each get a single
quiet tick as they illuminate. One low resolving note on the logo. If a trending audio is
used for reach, use it *only* under the first two beats and duck it to nothing for the head
turn; the silence there is doing the work.

**Editing / transitions.** Continuous, no hard cuts — this is a character piece and cutting
breaks the spell. Push-ins are slow and continuous. Text in quotation marks (beat 4) should
appear one word at a time, roughly at reading pace, which makes the audience hear it as
speech.

**What the student should feel.** A small chill, then affection. The intended reaction is
*"okay, that's actually kind of unnerving — and I want it."* Zero should be liked because he
is competent, not because he is cute.

**Why it matters strategically.** It converts the campaign's accumulated abstraction into a
character students can name, remember and talk about — which is the durable brand asset out
of these six pieces. Withholding Zero for five pieces is what makes his arrival worth
watching, and introducing him through his *diagnostic* capability rather than his solving
capability means the mascot reinforces the positioning instead of collapsing it into "the
cute dragon that does your homework." The caption also carries the two disclosures
`knowledge-base.md` requires — Zero is fictional, and he delivers educator-authored methods
rather than inventing them — placed where they read as confidence rather than as a
disclaimer.

---

# PART 5 — Generated assets (Higgsfield)

Six key visuals were generated at 2K on `nano_banana_pro` and are attached in the
conversation. They are **base plates**, deliberately text-free and logo-free.

| ID | Piece | Ratio | Higgsfield job id |
|---|---|---|---|
| KV-01 | FB1 — paper→light hero | 4:5 | `d64eac90-1d05-431c-be61-526aa32ee6b3` |
| KV-02 | IG1 — vertical ignition plate | 9:16 | `c1e63aef-1298-4f70-8fdf-f91f2870b5c3` |
| KV-03 | FB2 — four sheets, one error | 4:5 | `41a9806e-b128-45ca-8d69-c27235e76d3d` |
| KV-04 | IG2 — Cairo desk, 2am | 9:16 | `373e03bd-f88a-42ed-a537-db882c80d682` |
| KV-05 | FB3 — the fingerprint | 4:5 | `3f2f8d4d-e501-4220-9b80-087f732001d7` |
| KV-06 | IG3 — Zero master | 9:16 | `da9e1a0d-7dc1-4839-83c2-70e429bef7f9` |

Real brand logo imported to Higgsfield as media `a0928419-b2d4-45b1-9c13-f23f22b35bf1`
(from `https://www.si-math-ai.com/assets/si-math-ai-logo.jpg`).

## The production pipeline

```
1. GENERATE PLATE      Higgsfield · nano_banana_pro · 2K · text-free, logo-free
2. SELECT              3–4 variants per plate; pick on lighting and texture, not subject
3. ANIMATE             Higgsfield · seedance_2_5 (motion) or kling3_0 (character)
                       image-to-video from the approved plate, 5s segments
4. UPSCALE             upscale_video · topaz · 1080p  (only the hero cuts; it costs)
5. COMPOSITE           Canva/Figma — real logo, real typeface, all on-screen text
6. SOUND               Music/SFX bed per the direction above
7. PUBLISH             Correct ratio per platform, safe areas respected
```

**Never generate the logo or the on-screen typography inside Higgsfield.** Image models
approximate letterforms; the wordmark would come back subtly wrong and a subtly wrong logo
is worse than no logo. Every mark and every word in the final assets is composited in step 5
from the real file.

**Budget note.** At time of writing the Higgsfield account holds ~183 credits.
`nano_banana_pro` images are 2 credits each; `seedance_2_5` video is ~32.5 credits per 5s
segment. The six videos specified here need roughly 12–14 segments — call it 400–460 credits
of video, plus selection variants. **Plan on topping up before the video phase**, and shoot
the plates first: an approved still is what makes an expensive video generation land on the
first or second attempt rather than the fifth.

**Environment note.** This session's network policy blocks the Higgsfield CDN
(`d8j0ntlcm91z4.cloudfront.net` returns 403 through the proxy), so the renders could not be
downloaded and inspected locally here. They are displayed in the conversation via the
Higgsfield widget and should be reviewed there before anything is animated.

---

# PART 6 — Compliance guardrails

Every line of copy above was written against `docs/knowledge/knowledge-base.md`. The
constraints that shaped it, so that any future piece in this campaign stays consistent:

**Never written, anywhere in this campaign**
- No score claims, no "+150 points", no "guaranteed improvement"
- No student counts, star ratings, "trusted by N students", or any statistic at all —
  `FABRICATED_PROOF` exists because these are the numbers most often asserted without a source
- No testimonials, real or composed. `trust.html` documents that this site once published
  fabricated ones and removed them; the campaign does not reintroduce them by another door
- No superlatives — "best", "#1", "most advanced AI", "the future of education"
- No "you need Si Math AI to succeed", in any language. `knowledge-base.md` §1a makes this a
  constraint on the product, not just on the copy
- No "extra practice" or "more practice questions" — the entire point is that it is *not* more
- No "AI tutor", "AI chatbot for SAT", "math chatbot", "AI that teaches SAT"

**Always true in this campaign**
- Si Math AI is a **learning platform for SAT, ACT and EST Mathematics** — the exam and the
  *subject*, never "an SAT platform"
- Students **bring their own questions**. Stated or implied in all six pieces, because the
  question-bank misreading is the most damaging one available
- **The course teaches. Si Math AI accelerates learning.** Explicit in FB3
- The **boundary is published** — Math only, not Reading, not English, not Science, not
  essays. Stating it is what makes the specialisation claim credible
- **Zero is a fictional guide character** who delivers educator-authored methods rather than
  inventing them. Disclosed in IG3, the only piece where he leads
- **Free plan, no credit card** — verified against `pricing.html`

**One thing to check before posting.** No creative in this campaign states a message quota,
and it must stay that way. `plan-catalog.js` records that hardcoded literals ("10 free
messages") drifted out of sync with the actual `daily_limit` once already. The catalogue is
the only source of truth for that number, and a poster is not the catalogue.

---

# PART 7 — Posting sequence

| Day | Piece | Platform | Spend |
|---|---|---|---|
| 0 | Ignition | IG Reel | Organic + small reach boost |
| 0 | The Common Thread | FB | Organic + brand-awareness boost |
| 3 | Which 20 Minutes | IG Reel | Highest paid spend of the six — this is the piece that recruits |
| 4 | The Fourth Time | FB Carousel | Retarget everyone who engaged with day 0 |
| 7 | Zero Remembers | IG Reel | Organic + retarget IG engagers |
| 8 | An Answer Disappears | FB | Retarget everything. This is the conversion ask. |

The sequencing is doing real work: the two teaser pieces run first and are never asked to
convert; the pain pieces run to cold audiences because that is where "that's literally me"
recruits new people; and the two explanatory pieces run **only to warmed audiences**, because
they are long and they answer questions a cold viewer has not yet asked.

**One measurement discipline.** Do not judge pieces 1 and 4 on clicks — they are not click
pieces and killing them on a CTR read would remove the thing that makes pieces 3, 5 and 6
work. Judge 1 and 4 on completion and saves, 2 and 5 on shares, 3 and 6 on account creation.
