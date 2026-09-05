# Teacher Intelligence Layer — Product Direction

**Status: DIRECTION ADOPTED — NO IMPLEMENTATION AUTHORIZED.**
This document records a product direction and the architecture philosophy that
governs it. It authorizes nothing: no schema, no migration, no teacher-facing
surface, no role change, no public copy. A future session that reads this file
as a build brief has misread it — §0 says so, and §10 says what would have to
become true first.

**Adopted:** 2026-08-30, from the founder's product direction.
**Scope:** internal engineering/product record (`docs/roadmap/`). The public
knowledge-layer freeze (CLAUDE.md §5) does not cover this file — and forbids
publishing any of it until the feature exists (`governance.md` §3, *"Features
that do not exist"*).
**Depends on:** the Mock Experience and the evidence it captures. That work comes
first, by decision, not by accident (§5, §10).
**Measured against:** the live project `igvkyxkmjnkzscqgommj` on 2026-08-30. Every
count in §5 was read from the database on that date. When a number here disagrees
with reality, reality is right and this file is stale.

---

## 0. What this document is

It is three things.

1. **The canonical statement of the direction.** The teacher layer is a *second
   product inside the platform*, not an admin screen. If the language drifts
   later — and it will, because "teacher dashboard" is the phrase everyone
   reaches for — this file is what it drifts back to.
2. **A refusal instrument.** The strongest thing a direction document does early
   is stop the wrong version from being built while the right version is still
   impossible. §5 shows, in measured numbers, that the platform cannot honestly
   compute almost anything described here yet. §6 gives the test that decides
   when it can. §9 lists what it must never become.
3. **A dependency map.** Every idea below is written with its prerequisite
   attached, so the order of work is derivable rather than argued about.

The one sentence the whole direction compresses to:

> **The platform doesn't simply tell teachers who their students are. It helps
> them see who their students are becoming.**

---

## 1. The thesis

A teacher with a team of assistants can, eventually, do most discrete tasks the
platform does. They can mark papers. They can compute percentages. They can tell
a student what they got wrong. Any feature whose value is *doing one of those
tasks faster* is a convenience, and a convenience is not a reason to bring
students onto a platform.

So the design question is not "what can we show a teacher?" It is:

> **What can the platform see continuously, across time and across an entire
> class, that a teacher and a team of assistants realistically cannot see at
> scale?**

The answer is not a task. It is **memory**: an unbroken record of every attempt,
every mistake, every repetition and every interval between them, for every
student, held over months and connected across students. A human team can observe
any single moment better than software. No human team can hold three hundred
students' moments in relation to each other, continuously, without forgetting.

That asymmetry — **not tasks, but continuity** — is the only durable reason a
teacher would bring their students here. Every feature in this direction must
trace back to it. A feature that a diligent assistant could reproduce in an
afternoon is out of scope no matter how good the screen looks.

The distribution consequence follows:

> Students come because the Mock experience is genuinely useful and compelling.
> Teachers bring students because the platform gives them continuous visibility
> they cannot realistically create manually.

---

## 2. Position — this extends the existing positioning, it does not revise it

`docs/knowledge/knowledge-base.md` already states the platform's relationship to
teachers, and it is published, load-bearing and enforced by CI. The teacher layer
must be a *consequence* of that positioning, never a correction of it.

| Already canonical (`knowledge-base.md`) | What the teacher layer adds |
|---|---|
| "The teacher teaches. Si Math AI coaches." | The coaching record becomes visible to the teacher who teaches. |
| "AI is not the teacher. It is the learning accelerator." | The accelerator reports to the teacher; it does not outrank them. |
| "Si Math AI multiplies the impact of great teaching." | The multiplication becomes observable — the teacher can see where their teaching landed and where it did not. |
| Every comparison line credits the teacher first — *deliberate, not decorative* | Every teacher-facing surface keeps that order: the teacher decides, the platform informs. |

The banned constructions stay banned. Nothing in the teacher layer may be
expressed as "teachers cannot", as a deficiency the software repairs, or as a
comparison the teacher loses. The validator's negation-aware matcher already
fails the build on those strings; the direction agrees with the validator on
purpose.

**The invariant:** the platform never becomes an authority *over* the teacher.
It is an instrument the teacher points, and the teacher reads the result.

---

## 3. The three gates, answered honestly

CLAUDE.md gates every feature on three questions. The teacher layer is the first
major direction where the honest answer is *indirect*, and pretending otherwise
would corrupt the gate.

| Gate | Honest answer |
|---|---|
| Does this improve learning? | **Only through the teacher's action.** The platform showing a teacher a pattern changes nothing by itself. The change happens when the teacher intervenes. |
| Does this improve understanding? | Same — mediated. The layer's contribution is *directing expert attention at the student who needs it*, sooner than the teacher would otherwise have known. |
| Does this improve long-term retention? | Only if the intervention it triggers does. Which means the loop in §12 is not a nice extra: it is the only thing that makes the answer to this question knowable. |

The gate therefore produces a hard rule, and it is the most important rule in
this document:

> **Every teacher-facing insight must name the action it exists to enable.**
> An insight with no action attached is a report. Reports are refused.

This is the test that keeps the layer from becoming a wall of charts. "Ahmed's
accuracy is 71%" enables nothing. "Ahmed has now spent more than four minutes on
the last six hard questions he attempted, and left the section incomplete each
time — his score has not moved yet" names a conversation the teacher can have
tomorrow morning.

---

## 4. The direction, in eight ideas

Each idea below states what it means, what it requires, and — the part that
usually gets lost — **what it must not become**. The founder's own framing is
preserved verbatim where it is the clearest statement of intent.

### 4.1 A Living Classroom Map, not a gradebook

A teacher must not open the platform and see this:

```
Ahmed — 72%    Sara — 84%    Omar — 61%
```

> That is not intelligence.

A ranked list of percentages is the thing every existing product already does,
and it is the thing an assistant can produce. The teacher should instead be able
to read the class as a **living map**: where each student is now, whether they
are genuinely moving, which skills are strengthening, which weaknesses keep
returning, who is ready for harder work, who is working hard without converting
it, and who is improving too slowly for the date of the real exam.

- **Requires:** repeated, comparable attempts per student over time; a cohort
  entity; per-attempt structure richer than a single score (§5 shows we have
  none of these).
- **Must not become:** a prettier gradebook. The test is whether removing every
  raw percentage from the screen would leave anything useful. If not, it is a
  gradebook with better typography.

Working names — *Living Classroom Map*, *Classroom Twin* — are concepts, not
committed feature names (§13).

### 4.2 Visibility between exams — the trajectory, not the result

Traditionally a teacher sees a student at four moments: in class, on homework, on
a quiz or mock, and when the student asks for help. Everything between those
moments is invisible. The platform's memory covers exactly that gap.

For each student the eventual shape is:

> **Where they started → what they practiced → what repeatedly failed → what
> changed → where they are now.**

So the teacher receives a story backed by evidence rather than a number. Two
examples, both of which invert what the score alone says:

> **Student A is still scoring around 70%, but this is actually improvement.**
> Their algebra accuracy increased significantly; timing on word problems is now
> the limiting factor.

> **Student B still scores 85%, but their performance has stopped improving
> across the last several mocks.** Their apparent strength may be hiding a
> plateau.

- **Requires:** enough attempts per student that "trajectory" is a measurement
  and not a line through two points (§6).
- **Must not become:** narrative generated for its own sake. Every clause in a
  story like the ones above must be individually traceable to evidence the
  teacher can open (§6, *never hide the evidence behind the intelligence*).

### 4.3 The Hidden Student

The student who most needs attention is often not the lowest-scoring one. The
lowest scorer is already visible; that is the one thing the traditional system
does reliably.

The hidden student may be:

- the quiet student slowly falling behind, well before the score collapses;
- the high scorer whose improvement has silently stopped;
- the student practicing constantly while repeating one mistake;
- the student who understands the material but collapses under time pressure;
- the student who performs well digitally and may not on paper;
- the student whose recent direction of travel is wrong, whatever the level.

The surfaced form is an invitation, never a verdict:

> **"You may want to check on these 3 students."**

Not a judgment, and not a replacement for the teacher — an **early-warning system
for human attention**.

- **Requires:** per-student longitudinal series, a defensible definition of
  "changed" versus "noise" (§6), and a false-positive budget (§6.4).
- **Must not become:** a label attached to a student. Flags are **events with a
  timestamp and an expiry**, not attributes of a person (§6.5). "Ahmed is a
  hidden student" is a stigma; "this pattern appeared in Ahmed's last three
  attempts" is an observation that can also stop being true.

### 4.4 Attention allocation — the real question a teacher has

Teachers do not need more data. They need an answer to:

> **Where will one minute of my attention make the biggest difference right now?**

The eventual grouping is by *what the teacher should do*, not by score:

- 🔴 **Needs attention** — the trajectory shows a real problem.
- 🟡 **Watch** — a pattern is emerging; the evidence is not yet sufficient.
- 🟢 **Ready to advance** — ready for harder material or a different challenge.

The teacher remains the decision-maker. The platform helps them **allocate
attention intelligently**, which is a scarce-resource problem, not a reporting
problem.

- **Requires:** a ranking that competes for a *fixed* attention budget (§6.4).
- **Must not become:** a permanent traffic light bolted to each student's name,
  or a queue that always has something in it. A layer that speaks every day
  teaches teachers to stop listening. **Silence is a valid and usually correct
  output.**

### 4.5 From one mock for everyone to the right next challenge

A teacher gives one mock to the whole group because producing and marking
individualized practice is expensive. The platform can make the *options* legible
without fragmenting the class:

- who should take the next full mock;
- who needs targeted repair first;
- who needs timing work;
- who needs paper-execution work;
- who is ready to be pushed harder.

> **The teacher chooses. The platform makes the options visible.**

- **Requires:** the mock content foundation (forms, sections, items) plus
  per-student diagnosis good enough to justify a recommendation.
- **Must not become:** automatic assignment, or "give every student a different
  exam". The shared classroom experience has value the platform did not create
  and must not casually destroy.

### 4.6 Mathematical readiness ≠ paper execution readiness

For EST the real exam is on paper. The platform should not pretend the screen
replaces paper — and this is where the apparent weakness of a digital platform
becomes its distinctive contribution.

Two different questions, kept separate:

| Construct | The question it answers |
|---|---|
| **Mathematical Readiness** | Can the student solve the mathematics? |
| **Paper Execution Readiness** | Can the student perform under the physical reality and pressure of the paper exam? |

So a teacher could eventually see:

> **Mathematically strong. Paper execution still developing.**

> **Good accuracy, but loses time navigating between questions and written work.**

> **Digital intelligence can be used to make paper performance better.** The
> platform is not competing with paper; it becomes the intelligence layer around
> paper training.

- **Requires:** far more than a screen can observe on its own. See §11, which is
  where this idea's honest limits are written down.
- **Must not become:** a "paper readiness score" the platform cannot validate
  against real paper outcomes. That is a fabricated claim wearing a number.

### 4.7 The timeline — leading indicators, not only outcomes

For a teacher, *when a problem began* is often more useful than its current size.

```
Week 1 — accuracy stable
Week 2 — time per hard question starts rising      ← first real signal
Week 3 — more questions left unresolved
Week 4 — the score finally drops                   ← the only thing a gradebook sees
```

> **The score is often a late signal. Patterns can be early signals.**

The whole value of the layer lives in the gap between week 2 and week 4.

- **Requires:** signals that move *before* the score, captured per attempt, at a
  cadence fine enough to order them in time (§7).
- **Must not become:** retrofitted storytelling — picking the moment a decline
  "began" after the fact, from whatever series happens to fit. A leading
  indicator is only leading if it was recorded before the outcome it precedes.

### 4.8 The class, not only the students

Above individual intelligence sits the class-level view: which concepts stay
difficult across the group, which misconceptions survive teaching, where
understanding fails to transfer into timed performance, which difficulties are
systemic versus isolated to a few students.

> **"This class is strong in Algebra, weak under time pressure, and I have 6
> students who need attention before the next mock."**

That is a decision-making tool, not a gradebook. And it leads directly to the
loop in §12 — and to the sharpest boundary in this document:

> This is **not about evaluating or ranking teachers.** Not: *"here is a ranking
> of teachers."* Instead: *"here is what your students are experiencing, at a
> scale that is normally invisible."*

---

## 5. Reality check — what the platform could compute today

Everything in §4 is a claim about evidence. So the honest question is what
evidence exists. All counts below were read from `igvkyxkmjnkzscqgommj` on
**2026-08-30**.

### 5.1 What is captured today

| Source | Rows | What it actually contains |
|---|---:|---|
| `exam_practice_sessions` | 22 | One row per mock sitting: `exam_type`, `score`, `correct/wrong/omitted_answers`, `duration_minutes`, `started_at`, `ended_at`. **Session-level only.** |
| `exam_mistakes` | 11 | Student-entered mistakes: `topic`, `subtopic`, `mistake_count`, optional `question_id` / `correct_answer` / `student_answer`. |
| `question_records` | 1,437 | Tutor-chat evidence: question, topic/subtopic, difficulty, confidence before/after, repetition and help-request flags, verification columns. **No time-on-task column.** |
| `mastery_records` | 249 | Per (student, topic, subtopic): `mastery_score`, `accuracy`, `questions_seen/correct`. |
| `weakness_signals` / `weakness_reports` | 891 / 225 | The weakness pipeline's inputs and generated reports. |
| `session_questions` | 712 | Per-question index of a chat session. |
| `focus_tasks` / `focus_plans` | 325 / 18 | Assigned repair work and its completion. |
| `profiles` | 37 | Every registered account, students and staff alike. |

Content authoring for the real mock exists and is deliberately not student-facing
yet: `exam_forms` 1, `exam_form_sections` 3, `exam_questions` 66, `exam_stimuli`
25, `exam_integrity_events` 40. The `exam_forms` comment states it plainly —
*"no student access of any kind (delivery is a future, separately approved
phase)"*. That phase is the Mock Experience this direction waits on.

### 5.2 The numbers that settle the argument

Of the 22 mock sessions:

| Measure | Value |
|---|---:|
| Distinct students with **any** mock session | **5** |
| Students with **3 or more** sessions | **2** |
| Sessions belonging to the single most active student | **15** |
| Students who logged any exam mistake | 4 |

A "trajectory" needs repeated comparable attempts. Today, two students have three
or more, and one student is 68% of the entire corpus. **Any classroom-level
insight built now would be a claim about one person, dressed as a claim about a
class.** No modelling choice fixes that; only usage does.

### 5.3 The four blocking absences

Sample size is the loudest problem but not the deepest. Four things are missing
structurally, and each one blocks a specific idea in §4:

1. **No per-question evidence from a mock.** The current flow is
   `SELECT → TIMER → RESULTS → MISTAKES → SAVING`: the student takes the exam on
   paper, then types in their totals and their mistakes. There is no per-item
   response, no per-item time, no ordering, no navigation trace. Ideas 4.2, 4.4,
   4.6 and 4.7 are *arithmetically impossible* on this data — not hard, impossible.
2. **No cohort of any kind.** There is no class, group, enrollment or roster
   table anywhere in the schema. The unit "a class" that the entire direction
   talks about does not exist as a thing the database can name.
3. **No teacher.** `user_role` is exactly `user | admin | super_admin | owner`.
   There is no teacher role, no teacher identity, and no concept of a student
   being *someone's* student.
4. **No sharing model.** Every academic table is student-scoped —
   `auth.uid() = user_id` on `question_records`, `exam_practice_sessions`,
   `exam_mistakes`, `mastery_records`, `session_questions`, `weakness_reports`.
   The only elevated readers are admin (`auth_is_admin()`,
   `has_role_at_least('admin')`). A teacher reading a student's data is not a new
   query; it is **a new access model** (§8).

### 5.4 The conclusion this forces

> If a teacher layer shipped today it would be a gradebook with better vocabulary,
> computed from 22 sittings by 5 students, presented with a confidence the data
> cannot support.

That is the failure this document exists to prevent. Which is exactly the
founder's own constraint, and it is adopted as a rule:

> **We should not build a giant teacher dashboard full of charts before we have
> real student behavior and enough attempts to justify the insights. The
> strongest features must emerge from actual evidence collected through the Mock
> experience.**

---

## 6. The four gates — and the honesty rules for an insight

`verification-framework-audit.md` produced the rule this project keeps returning
to:

> **A green check is only evidence if it could have gone red.**

Its teacher-layer form:

> **An insight is only intelligence if it could have said something else.**

An "insight" that fires for every student, or that no data could have refuted, is
a **vacuous assertion** — the same defect the verification audit found in the
economics checks, relocated to a screen a teacher trusts.

### 6.1 The four gates

Any proposed teacher-facing feature must pass all four. Most proposals stop at
the first, which is the point.

| Gate | The question | Fails when |
|---|---|---|
| **1 · Evidence** | Does the data required already exist, at a volume where the claim could be wrong? | The signal isn't captured, or n is too small to distinguish the claim from noise. |
| **2 · Action** | What will the teacher *do* differently because of this? | The honest answer is "be informed". That is a report (§3). |
| **3 · Falsifiability** | What observation would have produced the opposite output? | Nothing would. The insight is decoration. |
| **4 · Consent** | Is the student's data being seen by this teacher with a consented, scoped, revocable, auditable grant? | Access is inherited from "admin can read everything" (§8). |

### 6.2 Minimum evidence, stated in advance

Thresholds must be fixed **before** the analysis is written, never chosen after
seeing which cut produces an interesting screen.

- **No claim from a single attempt.** One mock is a measurement with large error,
  not a position.
- **No trajectory from two points.** A direction of travel needs enough attempts
  that the direction survives removing any one of them.
- **A change must clear the noise floor**, and the noise floor must be *measured*
  from the platform's own repeated-attempt variance — not assumed, and not set to
  whatever makes the feature look decisive.
- **"Not enough evidence yet" is a first-class output**, displayed as such. A
  teacher who sees the platform say *"I don't know yet"* learns to believe it when
  it says something else.

### 6.3 Never hide the evidence behind the intelligence

Every surfaced claim must open into the attempts it came from, and a teacher who
opens it must be able to reconstruct the reasoning. Two consequences:

- **A claim the teacher cannot verify is not shippable**, regardless of how good
  the model behind it is.
- **A claim that cannot be shown in evidence must not be shown at all** — which
  rules out any insight whose only justification is "the model said so".

This also protects the teacher's standing: they will have to defend what the
platform said to a student or a parent, and they can only defend what they can
see.

### 6.4 Attention is the scarce resource — so flags have a budget

The cost of a false "needs attention" is not a wrong pixel. It is a teacher's
minute spent on the wrong student, and possibly a student marked as struggling
who was not.

- The surface is an **attention budget, not a feed.** A fixed number of flags per
  class per week, competing against each other by expected value.
- **Precision over recall for negative flags.** Missing a struggling student is
  bad; crying wolf destroys the layer's credibility permanently, and a layer
  nobody trusts helps no one.
- **An empty week is a valid week.** No filler.

### 6.5 Flags are events, not attributes

A flag attaches to a *situation*, carries a timestamp, and expires. It never
becomes a property of the student. "Ahmed is a hidden student" is a label a
teacher may carry for a year; "this pattern appeared in Ahmed's last three
attempts, and last appeared on 12 March" is an observation that can stop being
true — and must be able to.

---

## 7. Signals — candidates, and what each would cost

A catalogue of what *could* eventually be computed, ordered by how far it is from
today. **This is a candidate list, not a specification**; nothing here is
approved, and the point of the table is the right-hand column.

| Candidate signal | Kind | Needs |
|---|---|---|
| Effort without improvement (activity high, mastery flat) | Leading | Available in weak form today — activity and mastery deltas both exist. Blocked by n, not by schema. |
| Recurring mistake type across attempts | Leading | Mistake capture that is not student-typed; item-level tagging through the taxonomy. |
| Repetition of the same question / re-explanation | Leading | Already recorded on `question_records` (`repeated_question_count`, `re_explanation_count`). Not yet related to exam outcomes. |
| Time per item rising on hard items | Leading | **Per-item timing from a delivered mock.** Does not exist. |
| Not abandoning a lost question (pacing discipline) | Leading | Per-item timing plus ordering/navigation. Does not exist. |
| Rising unresolved/omitted count | Leading | Per-item responses, or at minimum reliable omitted counts across many sittings. |
| Plateau at a high score | Leading | Long series per student; strict noise-floor definition (§6.2). |
| Accuracy improving while timing degrades | Leading | Both dimensions per attempt, per topic. |
| Gap between class members widening | Class | A cohort (does not exist) plus comparable attempts. |
| Misconception surviving teaching | Class | Cohort + item-level tagging + intervention marker (§12). |
| Score | Lagging | Exists. Is the thing everyone already has, and is the *last* signal to move. |

The shape of the table is the finding: **almost every leading indicator in the
direction depends on per-item evidence from a delivered mock.** That is why the
Mock Experience is the prerequisite and not a parallel track.

---

## 8. Access, consent and the data boundary

This is the largest architectural decision in the direction, and the one most
likely to be got wrong quickly and quietly.

### 8.1 The starting position

Today the schema says exactly one thing about who may read a student's academic
record: **the student**. `auth.uid() = user_id`, everywhere. The only exceptions
are admin-role readers, which exist for operating the platform, not for teaching.

A teacher is not an admin, and must never be implemented as one. Reusing the
admin path — "teachers get `is_admin`" — would grant a teacher access to every
student on the platform, including students who are not theirs, plus the
operational surfaces admins can reach. It is the fastest possible route from this
direction to an incident.

### 8.2 Principles for whatever replaces it

1. **The student's data is the student's.** A teacher sees it because the student
   (or their guardian) granted it, not because the teacher holds a role.
2. **Scoped in three dimensions:** to a cohort, to a window of time, and to a
   defined set of fields. Never "all data about this person, forever".
3. **Revocable, and revocation is real** — access ends, including access to what
   was already visible.
4. **Auditable.** Teacher reads of student data are logged. `role_audit_log` is
   the existing precedent for taking this seriously.
5. **Nothing about a student that the student cannot themselves see.** If the
   platform tells a teacher that a student has plateaued, the student is entitled
   to the same statement about themselves. This is a design constraint, not a
   settings toggle.
6. **Minors.** A large share of the student base is under 18, which makes consent
   a guardian question and not only a UI question. **Flagged, not decided here**
   (§15).

### 8.3 The read-only boundary

> **The teacher layer reads. It must never write into the learning profile.**

The student's mastery, weakness signals and study plan are produced from the
student's own work. A teacher's flag, note or opinion must never become an input
to them. Otherwise the diagnosis stops being a measurement of the student and
becomes a mixture of measurement and staff opinion — and no one downstream can
tell which is which.

The precedent already exists and is worth copying exactly: `support_tickets`
carries **no reference to any academic table**, with the recorded reason that
*support must never influence weakness analysis, mastery or the learning
profile*. The teacher layer inherits that boundary.

### 8.4 What must not flow to a teacher

Being someone's teacher grants visibility into their *learning*, and nothing else:

| Not shared | Why |
|---|---|
| Billing, plan, credit balance, payment history | A teacher must never see which student's family can afford what. |
| Support tickets and conversations | Explicitly walled from academic data already; a teacher is not support. |
| Device and session records (`user_devices`, `user_sessions`) | Security telemetry, not learning evidence. |
| Raw tutor chat transcripts | A student must be able to be confused in private. Derived topic/pattern evidence is the shareable form — the transcript is not. |
| `exam_integrity_events` | Client-reported, explicitly *"evidence, never proof"*, with **no student-readable path by design**. Routing it to teachers would turn a fragile signal into an accusation, and the teacher layer into proctoring. That is a different product, and not this one. |

---

## 9. Anti-goals

Stated so that a future proposal can be refused by citing a line rather than
re-arguing the philosophy.

| The layer must never | Because |
|---|---|
| Rank, score or evaluate teachers | The direction is the opposite: give the teacher visibility, never make them the measured object. "AI judges the teacher" ends the product. |
| Report on a teacher to anyone above them | Same reason. There is no upward channel. Attribution belongs to the teacher who did the teaching. |
| Replace the teacher's judgment | The platform supports judgment. The teacher decides. |
| Present a claim without its evidence | §6.3. An unexplainable flag is not usable and not defensible. |
| Attach permanent labels to students | §6.5. Flags are events with expiry. |
| Surveil students | The unit of observation is *learning behaviour inside the platform*, not the student's conduct. |
| Become proctoring | §8.4. Integrity signals stay out. |
| Auto-assign work to students | §4.5. The teacher chooses; the platform makes options visible. |
| Fragment the class into n individual curricula by default | The shared classroom has value the platform did not create. |
| Ship a chart because it is impressive | CLAUDE.md's three gates. Impressive is not a gate. |
| Be described publicly before it exists | `governance.md` §3 — publishing a feature that does not exist contradicts the Trust Center on the same site. |

---

## 10. Stages — admission criteria, not a plan

The stages below are **entry conditions**. Nothing here is scheduled, and reaching
a stage's condition does not by itself authorize the work: each stage still needs
explicit approval, and any schema or migration inside it needs its own approval
under CLAUDE.md §3.

The ordering rule: **a stage may not begin until the previous stage's evidence
condition is met.** The purpose of writing them down now is that the conditions
are chosen before anyone is invested in the answer.

### T0 — Now: evidence, no teacher surface

- **State:** where the platform is. No teacher role, no cohort, no shared access.
- **What happens:** the Mock Experience is designed and delivered on its own
  merits, for students. If it happens to capture per-item responses, per-item
  timing and ordering, the entire direction becomes possible later — but that is
  a consequence of building a good mock, not a teacher feature smuggled into one.
- **Exit condition:** delivered mock attempts accumulating from real students, at
  item granularity.

### T1 — Identity and consent, with no analytics at all

- **Entry:** T0's exit condition met.
- **What it is:** a class exists; a teacher exists; a student is in a class by
  consent; access is scoped, revocable and audited (§8). **The teacher sees the
  roster and nothing else derived.**
- **Why it ships alone:** the access model is the part that is expensive to get
  wrong and impossible to retrofit. Shipping it without analytics forces it to be
  designed on its own merits rather than bent around a screen someone already
  drew.
- **Exit condition:** real classes with real enrolled students, and revocation
  exercised at least once end-to-end.
- **LIVE since 2026-08-30.** `teacher_workspaces`, `workspace_staff`,
  `workspace_students`, `workspace_audit_log`, their guards, policies and 11
  RPCs (`supabase/migrations/20260830a…c`; rollback in `…z`, unapplied), the
  `teacher.html` workspace, the student's consent surface in `settings.html`,
  the relationship-driven nav entry, and `tests/teacher-access-scope.test.mjs`.
  Applied one at a time with owner approval and verified after each, then
  proven end to end under simulated JWTs — 25 of 25 assertions, including that
  a teacher writing directly as a privileged role still cannot create a link
  for a student. Full record: `docs/engineering/teacher-foundation-verification.md`.
  All four tables are empty; the first workspace is created deliberately.
- **The surfaces, 2026-08-30.** `teacher.html` is a working class surface for
  both roles: roster with search and status filters, class-shape stats, a
  "Needs you" strip that stays hidden when nothing needs deciding, join codes,
  assistant approval, and a class-activity feed read from `workspace_audit_log`.
  An assistant gets the same students and none of the controls, described as a
  different job rather than a degraded copy. `?preview=1` renders the whole
  thing from local fixtures without touching the database, so the product can be
  judged before a single real student is enrolled.
- **The Weakness plug-in point exists and is empty on purpose.** The student
  card carries a marked `data-slot="learning"` region with one writer,
  `renderLearning()`, and a contract naming the three surfaces one weakness must
  read the same on — the student's own badge, the teacher's card, the
  assistant's copy. Connecting weaknesses later is that function plus its
  evidence trail, not a redesign. `tests/teacher-surface.test.mjs` fails if the
  slot grows a second author or if the page ever shows a metric it cannot
  compute.
- **Weakness Intelligence v1, 2026-08-30 — surfaces wired, read PREPARED.** An
  evidence audit (`docs/engineering/weakness-evidence-audit.md`) established what
  the exam engine actually records: **no per-item responses exist anywhere**, and
  86% of weakness signals come from tutor conversations against 1.5% from mock
  exams. So v1 connects the weakness that genuinely exists rather than inventing
  an exam-derived one. `weakness-view.js` turns one `weakness_reports` row into
  a student, teacher or assistant view and **derives nothing** — the analyzer
  keeps sole authority over severity and trend, and a null trend (205 of 225
  live reports) renders nothing rather than "stable". Every teacher-facing
  weakness carries its basis, naming the absence of exam evidence when there is
  none. `20260830d_teacher_weakness_read.sql` is the first consumer of
  `teacher_can_see_student()` and went **live 2026-08-30** (`20260830195034`),
  verified 9 of 9 under simulated JWTs against a student holding 144 real
  reports. The workspace-pairing gate earned its place: a caller whom both
  earlier gates admitted — active staff of workspace B, able to see the student
  through workspace A — was refused by it. Withdrawing consent removes the
  weaknesses along with everything else.
- **T2 is not open.** The layer now shows a real weakness with its basis, and
  stops there. Trajectories, hidden students and attention allocation still wait
  on the evidence §5 says does not exist — per-item responses from a delivered
  mock.
- **On the ordering.** T1 was written above as waiting on T0's exit condition.
  It was built first, deliberately: T1 carries no analytics, so nothing in it
  depends on how much evidence exists, while the access model is the one part
  that is expensive to get wrong and impossible to retrofit. The sequencing
  constraint protects *insights* from thin data — it was never a reason to
  defer consent. T2 onward still waits on the evidence.

### T1.6 — The intervention record, and still no analytics

- **Entry:** T1 live. Nothing else. This stage deliberately carries no evidence
  condition, for the same reason T1 did not: it computes nothing.
- **What it is:** one durable record of a decision a teacher already made —
  *"I covered this with this student on this date."* Not a recommendation, not a
  flag, not a score. The teacher writes it; the platform stores it and shows it
  back.
- **Why it ships before the analytics it belongs to.** §12's loop needs to
  compare what happened *after* an intervention with what happened before it,
  and §4.7 fixes the condition that makes such a comparison honest: *"A leading
  indicator is only leading if it was recorded before the outcome it precedes."*
  An intervention log started on the day the loop is built has no history to
  compare against, and every entry backfilled into it is chosen with the outcome
  already known. Starting the record early is the only version of it that can
  ever be evidence. Same argument as T1, applied to a different table: the part
  that is impossible to retrofit goes first.
- **What it must not become.** Not a recommendation engine — the platform never
  suggests the intervention, it only stores the one the teacher chose. Not an
  input to anything: §8.3's boundary applies in full, and the table carries no
  foreign key into any academic table, exactly as `support_tickets` does not.
  Not a teacher performance record — §12's three rules bind here from the first
  row, and there is no aggregate across teachers, no comparison, and no upward
  channel.
- **Append-only, and withdrawable rather than editable.** A record whose text can
  be revised after the fact loses the one property that makes it useful later.
  A mistake is withdrawn, and the withdrawal is itself dated.
- **The student can see it.** §8.2 principle 5 — *"Nothing about a student that
  the student cannot themselves see"* — is stated there as a design constraint
  rather than a toggle, and this is the first surface where it costs something.
  It is honoured: the record is readable by the student it names, and the
  teacher is told so at the moment they write it. A note a teacher would not
  want their student to read is a note that belongs somewhere other than this
  platform.
- **Its honest limit, stated now.** An intervention record with nothing measuring
  the outcome is a log, not a loop. It becomes the loop only when a later stage
  can say whether the difficulty it targeted changed — and that still waits on
  the evidence §5 says does not exist. Nothing in this stage may be described,
  internally or externally, as closing the loop.
- **Approved 2026-08-30 (second session), by the founder, on the record.**
- **LIVE since 2026-08-30** (`schema_migrations 20260830204951`, migration
  `20260830g`, rollback `20260830x`). `class_interventions` plus its append-only
  trigger, two read policies and four RPCs; the record and its form on the
  teacher's student card, with the student-can-read-this warning shown at the
  moment of writing. Verified in two passes, 37 of 37 — 12 structural and 25
  behavioural against real accounts inside a rolled-back transaction, including
  that `service_role`, which holds every write privilege on the table and
  bypasses RLS, is refused by the trigger. Full record:
  `docs/engineering/teacher-intervention-verification.md` §7.
- **T1.6 IS CLOSED. Teacher Intelligence takes no further feature work for now**
  — founder's instruction, 2026-08-30. The next dependency is Mock delivery and
  the per-item evidence it produces, and that is where the work goes. A proposal
  to add anything to this layer before that evidence exists should be refused by
  citing this line and §5.
- **The dependency moved the same day.** `20260830e/f` landed the delivery
  schema — `exam_attempts` and `exam_responses`, the latter carrying answer,
  correctness, time on item and revisit count, which are exactly the four facts
  `weakness-evidence-audit.md` §5 found missing — and `exam.html` is the sitting
  itself. That closes the *structural* half of §5.3 absence 1. The other half is
  not closed by a migration: **the evidence still has to accumulate from real
  students sitting real mocks**, and until it does, §5.2's arithmetic is
  unchanged. T2 opens on attempts, not on tables.

### T1.7 — Primary Experience and routing (live 2026-08-30)

Not a feature — the identity model the T1 surfaces were already implying, made
explicit and single. `my_experience()` (`20260830i`) is one caller-scoped
function answering *"which product does this account belong in?"*, and
`login.html` and `nav.js` become its consumers instead of three surfaces
answering it three ways.

- **Being a teacher is still a relationship.** `primary` is derived from
  `workspace_staff` on every call. There is no `user_role` value for teacher,
  nothing is stored, and nothing can go stale.
- **The platform role does not decide the experience.** An admin who teaches
  nothing is a student here. Admin remains a capability reached from the Admin
  section, never a home. §8.2.
- **An account never loses its own student experience.** `can_student` is
  unconditionally true. A teacher who studies here is still a student.
- **A pending assistant is not staff.** Approved by nobody, refused by
  `teacher_roster()` and `teacher_student_weaknesses()` — so routing them to the
  staff surface would be a page of permission errors. This was a live defect:
  `nav.js` counted any row that was not `removed` as teaching. Fixed at the
  source rather than in one of its readers.
- **Routing is not a security boundary,** and this is the line to quote when
  someone proposes to make it one. The function takes no arguments, writes
  nothing, and grants nothing; every permission stays where §8.3 put it. A
  client that ignores it gains exactly nothing.

`20260830i` was applied 2026-08-30 and re-verified against the live database:
18 of 18 behavioural checks, the body byte-for-byte identical to the repository,
and the four workspace tables still holding 0 rows afterwards. Evidence,
mutation tests, and what was deliberately left out of the increment:
`docs/engineering/experience-routing-verification.md`. **It does not reopen
T1.6.** No analytics, no new academic read, no new access — it changes where a
browser sends someone, and nothing else.

### T2 — Per-student trajectory, evidence-first

- **Entry:** enough attempts per student that a trajectory can be wrong (§6.2),
  across enough students that the layer is not a portrait of one.
- **What it is:** for one student, the story of §4.2 — few signals, each one
  opening directly into the attempts behind it. Prefers saying *"not enough
  evidence yet"*.
- **Exit condition:** teachers report the trajectory told them something the
  score did not, and spot-checks show the evidence trail supports every claim.

### T3 — Attention allocation and the hidden student

- **Entry:** T2 in real use, plus a **measured** noise floor for every signal that
  will drive a flag.
- **What it is:** §4.3 and §4.4 — a small, budgeted set of flags per class per
  week, each with its evidence and its expiry.
- **Exit condition:** flag precision measured against what teachers found when
  they looked. A flag stream teachers stop opening is a failed stage, and is
  removed rather than tuned indefinitely.

### T4 — Class patterns and the intervention loop

- **Entry:** T3 trusted, and multiple classes with enough shared items for
  cross-student patterns to be real.
- **What it is:** §4.8 and §12.
- **Exit condition:** the loop can show, for at least one real intervention,
  whether the pattern it targeted actually changed.

**Paper Execution Readiness (§11) is not a stage.** It is a research question that
attaches to whichever stage first has data capable of answering it.

---

## 11. Paper readiness — the opportunity, and its honest limit

The EST is written on paper. That is usually treated as a weakness of a digital
platform; the direction treats it as the reason the platform is useful. But the
honesty requirement here is higher than anywhere else in this document, because
the construct is easy to name and hard to earn.

**What the screen can observe** (once a mock is delivered digitally): pacing,
abandonment decisions, ordering and revisits, accuracy under time, degradation
across a long sitting.

**What the screen cannot observe:** handwriting and working-out on paper, physical
fatigue, transcription errors between working and answer sheet, bubbling
mechanics, and the effect of a room full of other people.

Therefore:

> **"Paper Execution Readiness" is a hypothesis until it is validated against real
> paper outcomes.** Until then the platform may report the behaviours it actually
> observed — pacing, abandonment, degradation — and must not compose them into a
> readiness score it cannot check.

The validation path is real and worth naming: students take real paper exams, and
their outcomes can eventually be compared against what the platform predicted.
That is the same discipline as `knowledge-base.md` §0a — outcome evidence is the
addition the whole system was built to earn, and it is earned by measurement, not
by naming a metric convincingly. The project's CI already fails the build on
fabricated proof; a readiness score with no validation would be exactly that,
merely on an internal surface instead of a public one.

---

## 12. The intervention loop

The most powerful idea in the direction, and the most dangerous.

```
Teaching → Practice → Evidence → Intervention → Improvement
                ↑                                    │
                └────────────────────────────────────┘
```

1. **The platform detects a pattern** — e.g. a group of students repeatedly
   failing the same reasoning step, or showing the same timing behaviour.
2. **The teacher intervenes.** They decide what to do: re-explain it differently,
   review it in class, assign targeted practice, speak to specific students.
3. **The platform observes what happens next** — not to judge the teacher, but to
   answer one question with evidence: *did the students actually improve?*

> "After the review session, most of the students no longer showed the same
> pattern. A smaller group still needs attention."

This is what makes the layer educational rather than administrative: it closes the
loop between teaching and learning with evidence, at a scale a human cannot hold.
It is also the answer to §3 — it is the only mechanism that makes the third gate
(*does this improve long-term retention?*) answerable rather than assumed.

**Why it is dangerous:** it is one design decision away from teacher evaluation.
The same data that says "the pattern cleared after the intervention" says "this
teacher's intervention worked". Three rules keep it on the right side:

1. **The unit is the pattern, never the teacher.** The loop tracks whether a
   *difficulty* resolved, not whether a person performed.
2. **Attribution is offered to the teacher, never computed about them.** The
   teacher sees their own loop. There is no aggregate across teachers, no
   comparison, and no upward reporting (§9).
3. **Absence of improvement is information, not blame.** A pattern that did not
   clear means the difficulty is harder than it looked — which is the single most
   useful thing the loop can discover, and it must be safe to see.

---

## 13. Vocabulary

Defined once here so that later work does not fork the language. These are
*internal working terms*. If and when any of them becomes a real feature, it
enters `docs/knowledge/graph-data.mjs` **before** it appears in any copy — the
graph is the registry of record, and a concept defined in prose but not in the
graph gets described three ways within a year.

| Term | Means exactly |
|---|---|
| **Living Classroom Map** | The class understood as positions and directions of travel over time, rather than a list of current scores. Working name. |
| **Hidden Student** | A student whose need for attention is not visible in their score. Never a label on a person (§6.5). |
| **Attention Allocation** | Ranking a fixed budget of teacher attention by expected value, not sorting students by score. |
| **Mathematical Readiness** | Whether the student can solve the mathematics. |
| **Paper Execution Readiness** | Whether the student can perform under the physical reality of the paper exam. A hypothesis until validated (§11). |
| **Leading indicator** | A signal that moves before the score does, recorded before the outcome it precedes. |
| **Lagging outcome** | The score. The thing every other product already shows. |
| **Intervention Loop** | Pattern detected → teacher acts → platform reports whether the pattern changed (§12). |
| **Flag** | A timestamped, expiring observation about a situation. Never an attribute of a student. |
| **Cohort / class** | A consented grouping of students under a teacher, scoped in fields and time. Does not exist yet (§5.3). |

---

## 14. Explicitly out of scope of this document

- **Any implementation.** No schema, no migration, no surface, no role, no RLS
  change is authorized by this file.
- **Teacher pricing, packaging or revenue share.** A commercial question, decided
  in `docs/roadmap/plan-catalog-v2.md` and
  `docs/engineering/pricing-financial-model-2026-08.md`, not here.
- **The Mock Experience design itself.** It is the prerequisite, and it is
  designed on its own merits for students. This document must not be used to add
  requirements to it; if a teacher-driven requirement is genuinely needed there,
  it is proposed there and justified there.
- **Any public description of the teacher layer.** Marketing, landing pages,
  FAQ entries, structured data, `llms.txt` — all forbidden until the feature
  exists (`governance.md` §3, CLAUDE.md §5). The narrative in §1 is persuasive,
  which is exactly why publishing it early would be a lie with good prose.

---

## 15. Open questions, to settle before T1

Recorded now because each one changes the shape of the access model, and none of
them should be discovered mid-implementation.

1. **Who owns a class** — the teacher, the platform, or an institution? This
   determines what happens to the class when the teacher leaves.
2. **How a student joins** — teacher invitation accepted by the student, a code
   the student enters, or an institutional roster? Consent has to be an act, not
   a default.
3. **What a teacher sees by default** on day one, before any analytics exist.
4. **Guardian consent for minors** — required, and in what form, given a student
   base that is largely under 18.
5. **What a student sees of their own teacher view** — §8.2 principle 5 says
   everything; the mechanism is undecided.
6. **Leaving a class** — what the teacher retains, and for how long. Default
   position should be: nothing new, and existing views expire.
7. **Teacher identity verification** — what stops an account from claiming to be
   a teacher and collecting student grants?
8. **Multiple teachers per student**, which is the normal Egyptian case (school
   plus centre plus private tutor). Scoping is per-grant, not per-student.
9. **Whether a teacher may see a student's activity that predates the grant.**
10. **Where a teacher grant sits relative to `user_role`** — the enum today is
    `user | admin | super_admin | owner`, and a teacher is probably a *grant*
    rather than a role, since being a teacher is a relationship to specific
    students rather than a level of privilege.

11. **Whether a class-level claim is blocked by the same evidence gate as a
    per-student one.** Raised 2026-08-30 (second session). **Answered: not yet
    — wait for the Mock.** Recorded in full because the argument survives the
    answer and will be made again. **Superseded 2026-09-01 — admitted by the
    owner under the pre-registered cut, with two further decisions locked before
    implementation; see the end of this entry.**

    *The argument for.* §5.2 measures the corpus per student — 5 students with
    any mock session, 2 with three or more, one holding 68% of it — and
    concludes no trajectory is computable. That conclusion is sound, and it is a
    conclusion about a **per-student series**. A claim of the form *"n of the m
    students in this workspace carry an active weakness on the same canonical
    subtopic"* needs one point per student across enough students, not a series
    per student. Aggregation is the operation that turns evidence too thin to
    describe an individual into evidence sufficient to describe a group; that is
    what it is for. On the four gates of §6.1 such a claim passes cleanly:
    the evidence exists (225 weakness reports, 139 canonical), the action is
    named and is the one a teacher actually takes (*re-teach this in the next
    session*), it is falsifiable (weakness spread evenly across 33 subtopics
    produces silence, which §6.4 already requires), and consent is the existing
    `teacher_can_see_student()` path with no widening.

    *The argument against, which is why the answer is no.* Three things, and the
    third is the serious one.
    - There is no class. All four workspace tables were empty on 2026-08-30, and
      a class-level claim with no class is a claim about the platform's 13
      students wearing a teacher's vocabulary.
    - 86 of 225 reports carry a null `subtopic_id` (38%). Grouping is only
      honest on the canonical id — the free-text labels already collide,
      `"Linear Equations"` and `"Linear Equations & Functions"` both resolving to
      `ALG_006` — so more than a third of the evidence cannot enter the
      aggregate at all and would have to be reported as excluded.
    - **Selection bias, which no sample size fixes.** 86% of weakness signals
      come from tutor conversations. Convergence in that corpus measures what
      students chose to *ask about*, which is not the same construct as what
      they get *wrong*: a topic being taught this week draws questions from
      strong and weak students alike. "9 students converge on `ALG_007`" would
      be read by a teacher as a diagnosis and is currently closer to a
      popularity measure. Exam-derived signals are the ones that would settle
      which it is, and there are 13 of them.

    *Pre-registered threshold, fixed now so it cannot be chosen later.* §6.2
    requires the cut to be set before the analysis is written. When this is
    built, a subtopic is reported as a class pattern only at **≥3 students AND
    ≥20% of the active roster** — both conditions, not either. Chosen
    2026-08-30, before any surface existed to make it look good: 3 of 60 is not
    a class pattern, and neither is 2 of 6. Whoever builds this inherits the
    number; changing it is a decision to record here, with its reason, not a
    tuning knob.

    *Admitted 2026-09-01.* A class exists now (T1 live since 2026-08-30: one
    workspace, one teacher, one active student), and a read-only audit that day
    established that the per-student reads already carry everything the
    aggregate needs except one thing, recorded below. The owner admitted the
    surface on the pre-registered cut — **≥3 distinct active students AND ≥20%
    of the active roster, both** — and locked two further decisions before a
    line was written, so neither could be chosen against a screen:

    - **(a) Freshness — inherited, not new.** A row counts toward a pattern only
      when its `last_signal_at` is within `FRESH_DAYS = 14`, the constant
      `teacher_attention()` already uses. A class pattern is a reason to act
      *now*; six students who struggled a month ago is history, and two
      definitions of "current" on one page would be two chances to disagree.
      Measured cost of the rule, platform-wide on 2026-09-01: 22 canonical
      subtopics met ≥3 students ignoring freshness; **0** met it within 14
      days. Silence is the expected output, and a valid one (§6.4).
    - **(b) Identity — the stored id, not the resolver.** The aggregation key is
      `weakness_reports.subtopic_id` as written at the student's last
      regeneration. `taxonomy.js` may resolve labels for display; it must not
      recover or reinterpret a null historical id for counting. Rows with a
      null `subtopic_id` are excluded, and the exclusion is disclosed in the
      card as unmapped evidence. Measured: 86 of 225 reports carry no id; the
      current resolver would recover 5 of them, and those 5 are deliberately
      **not** recovered — counting them would re-read historical evidence with
      today's aliases, which is the resolver manufacturing a pattern. (The same
      replay showed the resolver reproducing the stored pair on 139 of 139 rows
      that have one, which is why it is safe for display.)

    Each qualifying pattern discloses, and never thresholds on: the distinct
    affected-student count over the active-roster denominator and the
    percentage; the high/critical student count exactly as stored; the source
    mix; the freshest `last_signal_at`; and the number of excluded rows.
    `trend` is neither derived nor aggregated (211 of 225 null). The basis line
    says what the argument above says: this is convergence in what students
    asked about, not exam correctness.

    *One consequence, found in the audit and recorded before implementation
    rather than around it.* `teacher_student_weaknesses()` returns `topic` and
    `subtopic` as labels and does not return `topic_id` or `subtopic_id`; no
    other teacher read does either, and a teacher holds no row-level read on
    `weakness_reports` (verified live: 0 rows). So decision (b) cannot be
    honoured by a UI-only build on today's read — the client would have to
    resolve the labels, which is exactly what (b) forbids. The stored id has to
    travel through a read. Three ways, for the owner to choose; implementation
    is held until one is:

    - **A.** Widen `teacher_student_weaknesses()` by two output columns,
      `topic_id` and `subtopic_id`, body otherwise identical. Not a new read and
      not new access — a taxonomy identifier derived from a label the caller
      already sees — with no schema and no policy. But a return-type change is
      a DROP + CREATE, so it is a migration: ACL re-asserted, rollback
      rehearsed, approved individually per CLAUDE.md §3.
    - **B.** A server-side `teacher_class_patterns(p_workspace)` that applies
      the cut, the freshness rule and the exclusion in SQL over stored ids and
      returns only qualifying patterns. One call instead of N+1, and the
      threshold lives in SQL as the attention budget does — and it is a new
      function, which the approval excluded.
    - **C.** Keep the UI-only scope by keying on the resolver — decision (b)
      reversed. Recorded only so the trade stays visible: it counts the 5 rows,
      and it lets the aggregate's identity drift whenever an alias is added.

    *Chosen 2026-09-01: **A.*** Prepared the same day as `20260901h` (forward)
    and `20260901t` (rollback), generated from the `20260830d` body rather than
    retyped; dry-run and rehearsed against production in aborted transactions —
    the widened read returned the real student's two rows with ids equal to the
    stored ones, the unlinked student was still refused, and the rollback's
    `pg_get_functiondef()` md5 returned to the pre-apply value. **Applied
    2026-09-01 as `20260901220926`** on a separate, explicit approval: live md5
    `5d69fc51…` equal to the value pre-computed from the file, ACL identical to
    the other teaching reads, the `20260830d` contract suite re-run 10 of 10 in
    an aborted transaction, every other function/policy/constraint hash
    unchanged. `20260901t` stays prepared and unapplied. The card follows.

    *Built 2026-09-01, in the repository and not deployed.* One block on
    `teacher.html` directly under Attention, hidden by default. The rule is a
    pure function in the page, lifted out and RUN by
    `tests/teacher-class-patterns.test.mjs` rather than pattern-matched:
    stored `subtopic_id` only, 14-day window applied before counting, distinct
    students, both thresholds independently, integer arithmetic for the share,
    `severeBands = ['high','critical']` declared once (the set
    `teacher_attention()` counts) and read as stored, no trend anywhere, the
    refused read counted as unreadable rather than guessed. One reading the
    locked bullets left open, settled here: **when no pattern qualifies but
    fresh rows were excluded, the card shows only the disclosure** — "No
    class-wide pattern in the last 14 days" plus the unmapped count — because
    a disclosure the card hides is not a disclosure; it stays hidden only when
    there is nothing at all to say. Display names come from the taxonomy by
    id (a lookup), the stored label being the fallback. 21 of 21 mutants
    killed; one further mutant — the share test in floating point — proved
    *equivalent* on every exact-20% roster up to 400 and was dropped rather
    than counted, and the comment that had claimed otherwise was corrected.
    Rendered headless in five states (silent, pattern, excluded-only,
    assistant, hostile labels): the assistant sees the identical card, a
    chip opens the existing drawer, nothing injected fires.

12. **Whether a Teacher Exam needs its own access code.**
    Raised 2026-09-01. ~~**Answered: no — class membership is the access
    boundary.**~~ **REVOKED the same day, before any implementation. Superseded
    by §15.14.**

    Recorded rather than deleted because the reasoning that replaced it is the
    point. The original answer made class membership sufficient: join the class,
    see every published Teacher Exam in it. It was withdrawn on the observation
    that **a Class Code spreads.** It is read aloud in a room, photographed and
    forwarded, and it is deliberately long-lived — so a student outside the class
    who obtains one would have obtained every exam in that class along with it.
    Making membership the only boundary puts the integrity of every future exam
    behind the least-protected credential in the system.

    The paragraph below it — that a teacher may want a paper only part of the
    class sits, and that retrofitting a code onto a table already carrying live
    attempts is a migration over student work — survives the revocation and is
    now an argument *for* §15.14 rather than a deferred risk.

13. **Whether a teacher-AUTHORED exam's results become learning evidence.**
    Raised 2026-09-01. **Answered: no, not initially.** Results are shown to the
    teacher and to the student as academic results. They do **not** reach
    `weakness_signals`, `weakness_reports`, `mastery_records` or the analyzer.

    This is a different question from the one settled for teacher-*assigned*
    platform exams, which do produce evidence under a distinct `TEACHER_EXAM`
    source. The difference is the content, not the assignment: a platform paper
    has a reviewed taxonomy mapping and a calibrated difficulty on every item,
    and a teacher-authored question has neither. Feeding it into the pipeline
    would mix measured evidence with unvalidated content and leave nobody
    downstream able to tell which is which — the same failure §8.3 forbids for a
    teacher's opinion, arriving by a different route.

    **The bar for changing this is stated now, so it cannot be lowered later:**
    a designed and approved taxonomy mapping for teacher-authored items, and a
    difficulty signal that is measured rather than asserted by the author. Until
    both exist, a teacher exam is a result, not a measurement.

14. **How a student gains access to a Teacher Exam.** Decided 2026-09-01,
    replacing §15.12. **Every Teacher Exam carries its own unique Exam Code, and
    the code grants nothing by itself: it raises a request that a teacher or an
    active assistant must approve.**

    The rule, in full:

    ```
    can_start(exam, student) =
          approved                    -- teacher_exam_access.state = 'approved'
      AND active class membership     -- re-checked at every start, never cached
      AND exam open                   -- published, and not past its close
    ```

    Four properties are load-bearing and none may be quietly dropped:

    - **The two codes do different work and must never be conflated.** The Class
      Code creates a *relationship* (a `workspace_students` row). The Exam Code
      raises a *request against one exam* (a `teacher_exam_access` row). Neither
      substitutes for the other, and the exam itself stays scoped to its
      workspace so that even a leaked code keeps the decision inside the class.
    - **Approval is per exam.** It is never inherited from class membership, so
      an exam's audience is controlled individually even where the Class Code has
      spread widely. This is the whole reason the decision changed.
    - **Membership is a live condition, not a stored one.** Revoking a student's
      class link makes `can_start` false immediately, with no access row touched
      and no cleanup job — the same mechanism that already makes
      `teacher_can_see_student()` honest, and the reason §8.2 principle 3
      (*revocation is real*) holds here without a special case. An attempt
      already in progress may be finished and submitted; no new attempt may
      start. Destroying work a student is halfway through is a support incident,
      not a security control.
    - **A non-member may raise a request, and the teacher sees their name and
      nothing else** beyond a prominent *not in this class* marker. This is a
      deliberate trade: the queue becomes a leak detector, at the cost of a
      name being visible to a teacher the student has no relationship with. No
      academic, commercial or contact data crosses with it — §8.4 is unchanged.
      Bulk approval is restricted to verified members of the workspace, so an
      outsider can never be swept in by a single tap.

    **Rotating the Exam Code stops future code-based requests and silently
    revokes nothing** — pending requests stay in front of the teacher, who can
    then judge them knowing the code had leaked. Voiding them would hide the
    signal that prompted the rotation.

    Abuse is bounded by four layers, the first of which is a constraint rather
    than code: `primary key (exam_id, student_id)` means one row per student per
    exam *ever*; a decided row is not the student's to reopen; five pending
    requests per student per hour caps guessing across exams; and every failure
    returns one indistinguishable message, so the code box is never an oracle
    for which codes exist — exactly as `student_join_workspace()` already does.

    **Homework is not covered by this decision** and keeps its own model
    (code → immediate unlock, no approval). That asymmetry is deliberate —
    homework is practice, an exam is graded — and is recorded here so it reads
    as a choice rather than an oversight.


15. **Teacher Homework — audited 2026-09-01, six decisions locked 2026-09-02.**
    A read-only audit found nothing homework-shaped in production: no table,
    function or type. The task-shaped relations that exist (`focus_tasks`,
    `focus_plans`, `study_plans`, `exam_practice_sessions`) are the student's
    own study system and feed learning inference, so they cannot host
    teacher-set work — the reason Teacher Exams got their own tables. §15.14
    already recorded the access model (code → immediate unlock for an active
    member, no approval queue; *homework is practice, an exam is graded*), and
    the audit confirmed it fits: the Class Code makes the relationship, the
    Homework Code attaches one homework to a member, and every read re-checks
    membership live, exactly as `teacher_exam_can_start()` does. Reusable by
    call, unchanged: `workspace_is_active_staff()`, the live-membership
    predicate pattern, `exam_answer_matches()`, `exam_stimulus_shape_ok()`,
    `teacher_exam_new_code()`, the audit-log write, the code-normalisation and
    one-message convention, `stimulus-view.js`. Reusable as templates, copied:
    the 3b guards, the SELECT-only RLS shape, `teacher-exams.html`. Not
    reusable and not to be: the exam access queue, `teacher_exam_can_start`,
    `teacher_exam_is_staff`, the six exam tables. One finding beyond the ask:
    `exam.html` — the 3g student surface — is linked from nowhere and reachable
    only by URL; it needs its own decision.

    The six decisions, locked before a line of H1:

    1. **Feedback** — per-item correctness and the teacher's explanation after
       submission; the correct-answer text only when `reveal_answers = true`,
       default false. Counts-only, as exams give, would make homework pointless
       as practice.
    2. **Analyzer** — entirely outside it, exactly as Teacher Exams: no write to
       `weakness_signals`, `exam_mistakes`, `exam_practice_sessions` or any
       learning-inference table. Teacher-authored content is uncalibrated.
    3. **Late submissions** — allowed and flagged `late`, never refused solely
       because the due date passed.
    4. **Closing** — stops new opens; an attempt already in progress may finish
       (§15.14's rule, for the same reason).
    5. **Assistant parity** — full, on the same active-staff gate.
    6. **Student entry point** — a dashboard card, *From your teachers*. Not a
       site-wide `nav.js` student RPC (overkill for V1), and not URL-only, which
       is the 3g gap this finding exposed.

    Increments, each prepared, dry-run, mutation-tested, approved, applied and
    verified with a rehearsed rollback: H1 five audit labels → H2 tables,
    guards, RLS → H3 authoring RPCs and publish gate → H4 code, attach, student
    list → H5 open, save, submit, feedback, staff results → H6 staff UI → H7
    student UI and the dashboard card. **H1 applied 2026-09-02 as
    `20260902001047`**: the five labels at positions 17–21, the sixteen before
    them unmoved, each label written and read back for real in an aborting
    transaction, the two stored rows byte-identical, every other hash equal to
    the post-`20260901h` baseline. Its rollback posture `20260902z` — like
    `20260901y` — is not a clean undo and says so; it stays prepared and
    unapplied.

    **H2 is PREPARED and NOT APPLIED** (`20260902b` tables and guards,
    `20260902c` RLS, `20260902y` the undo). Before a line was written the live
    conventions were read rather than recalled: the six `teacher_exam*` tables
    with RLS enabled and `relforcerowsecurity` false, SELECT-only grants to
    `authenticated` and nothing to `anon`, nine SELECT policies, the four
    IMMUTABLE validators' exact signatures, `workspace_is_active_staff(uuid)`,
    and the 3b guard bodies. H2 mirrors that posture and borrows exactly four
    things, all by call and all value-in/boolean-out:
    `exam_stimulus_shape_ok()`, `exam_stimulus_spec_ok()`,
    `exam_question_choices_ok()`, `exam_question_answer_ok()` — asserted
    character-for-character identical to 3b's own calls. Nothing else is
    shared: the exam access table, `teacher_exam_can_start()` and
    `teacher_exam_is_staff()` are not referenced anywhere in the executable
    SQL, which the suite checks with stored `COMMENT ON` text stripped as well
    as `--` comments.

    Five tables, 28 named constraints, 9 foreign keys, 3 indexes, 5 guards on
    6 triggers, 1 staff helper, 7 SELECT policies, no RPC, no row. Where it
    differs from 3b, a locked decision says why: no `duration_minutes`, no
    `calculator_allowed`, no `opens_at`/`closes_at` (homework is untimed
    practice, publishing opens it); `due_at` nullable and `late` on the attempt
    (decision 3 — a date, never a lock); `reveal_answers` NOT NULL default
    false (decision 1); `teacher_homework_access` with three columns and **no
    state and no was_member** (§15.14 gives homework no queue); one attempt per
    student per homework as a UNIQUE pair, with no client request id, no
    duration and no `abandoned`. Once published the paper is frozen and exactly
    **three** fields stay mutable — the code (rotation answers a leak), `due_at`
    (a teacher may extend), and `reveal_answers` (turning answers on after
    everyone has submitted is the normal use, not an edit to the paper). That
    "exactly three" is derived from the table in the test, not listed: a new
    column whose fate nobody decided turns the check red.

    Verified against production without applying anything. The dry-run ran both
    files verbatim in an aborting transaction and then **49 probes, 0
    failures**: a teacher and an ACTIVE ASSISTANT read identically (the
    assistant was created through `staff_join_workspace()` and activated
    through `teacher_set_staff_status()` in the same transaction, so parity is
    demonstrated rather than asserted); a member student sees no paper and no
    content but does see their own attachment and their own attempt; an
    outsider sees nothing; `anon` cannot even call the staff helper; every
    client write — teacher, assistant, student, platform owner — is refused
    with `42501`, because no write path exists at all until H3; the guards
    refuse a cross-homework stimulus, an unreadable parent (fail closed), a
    moved item, a title edit after publishing, content changes on a published
    paper, a reopen, an attachment update or delete, and any change to a
    submitted attempt; a submission after `due_at` is ACCEPTED and flagged
    `late`; and `weakness_signals`, `exam_mistakes` and `exam_practice_sessions`
    moved by **zero**, with no audit row carrying a homework label. The
    rollback was rehearsed in its own aborting transaction: with one attachment
    planted it **refused** by name and count, and once that row was unwound it
    returned the constraint, policy, relation, trigger, grant and function
    hashes to their exact pre-H2 values. Production afterwards: 184 applied,
    newest still `20260902001047`, zero `teacher_homework%` objects, the audit
    log's two rows byte-identical.

    The contract suite is 128 checks and **34 of 34 mutants are killed**. One
    is worth recording because it survived first: a grant reading
    `to authenticated, anon` slipped past a check that matched
    `to authenticated` as a PREFIX. Both this suite and
    `teacher-access-scope.test.mjs` now compare the whole grantee list, and the
    same hole is closed for the exam tables.

    **One thing the approved scope leaves out, and it is a real gap.** H5
    cannot save or grade anything without a per-item answer record — the
    homework twin of `teacher_exam_responses`. The approved H2 scope named five
    tables and this is not one of them, so it is deliberately absent, nothing in
    these files assumes its shape, and it must be prepared, reviewed and
    approved as its own increment before H5.

    ---

    **H2 APPLY IS HELD (2026-09-02).** The owner accepted the preparation as
    technically clean and then declined to apply it until two gaps were closed:
    the missing answer record, and the lifecycle of the three fields that stay
    mutable after publish. Both were designed, measured, and then **approved on
    2026-09-03 with three decisions** — composite foreign keys rather than a
    guard, a one-way `reveal_answers` latch, and one atomic package. The files
    now implement all three and remain PREPARED and unapplied. What the package
    is, and the evidence behind it, is §15.15c.

    ### 15.15a · The per-item answer record — design, not yet written

    Audited against the two live models rather than recalled:
    `teacher_exam_responses` (3b, live, 0 rows) and the platform's own
    `exam_responses` (live, 0 rows). Proposed as its own migration
    `20260902d`, with rollback `20260902x`, **applied together with
    `20260902b/c` so that no partial schema is ever committed** — which is the
    owner's stated reason for holding H2 in the first place.

    ```
    teacher_homework_responses
      id                uuid primary key default gen_random_uuid()
      attempt_id        uuid not null -> teacher_homework_attempts(id) on delete cascade
      question_id       uuid not null -> teacher_homework_questions(id) on delete restrict
      homework_id       uuid not null                     -- see the composite-FK note
      ordinal           integer not null
      answer            text
      is_correct        boolean
      last_answered_at  timestamptz

      teacher_homework_responses_slot_uq      unique (attempt_id, question_id)
      teacher_homework_responses_ordinal_check    check (ordinal > 0)
      teacher_homework_responses_answer_check     check (answer is null or char_length(answer) <= 500)
      teacher_homework_responses_omission_check   check (answer is not null or is_correct is null)

      teacher_homework_responses_attempt_idx  (attempt_id, ordinal)
      teacher_homework_responses_question_idx (question_id)
    ```

    **What is deliberately absent, against 3b's shape.** `ms_on_item`,
    `visit_count` and `first_seen_at`. Homework is untimed and resumable across
    days: a millisecond total accumulated over a week with a tab left open
    measures nothing, and a revisit count over days is not the same quantity as
    a revisit inside a timed sitting. Both are numbers a later surface would be
    tempted to read as pacing evidence, which is precisely what decision 2
    forbids. With no visit tracking, `first_seen_at` collapses into the first
    write of `last_answered_at` and earns no column.

    **What is kept, unchanged, because the live schema supports the reuse.**
    The three-valued rule — `is_correct` true / false / **NULL = not answered**,
    made structural by the omission CHECK, so an omission can never be recorded
    as a wrong answer. The `answer` bound. The one-row-per-slot unique. The
    naming convention, constraint for constraint.

    **The one invariant 3b does not enforce, proposed here.** Nothing in the
    exam model structurally prevents a response row that points at an attempt of
    exam A and a question of exam B; it is correct only because the RPC builds
    the rows. Two ways to close it for homework:

    - **(a) a guard**, `teacher_homework_response_same_homework()`, mirroring
      the `teacher_homework_stimulus_same_homework()` already in `20260902b`.
      Costs one lookup per inserted row; touches no existing H2 file.
    - **(b) composite foreign keys — APPROVED 2026-09-03.** Denormalise `homework_id`
      onto the response row, add `unique (id, homework_id)` to
      `teacher_homework_attempts` and to `teacher_homework_questions`, and point
      two composite FKs at them. The invariant then holds by constraint rather
      than by a trigger a later migration could drop — the project's stated
      preference. **It requires two added lines in `20260902b`,** which is an H2
      SQL change and therefore needs approval; it is free now only because H2 is
      still unapplied, and would be an ALTER on live tables later.

    **RLS and grants**, following 3b exactly: RLS on; `revoke all` from `anon`
    and `authenticated`; `grant select` to `authenticated`; no write privilege
    for any client role; two SELECT policies — `_own_read` (the attempt is
    mine) and `_staff_read` (`teacher_homework_is_staff(a.homework_id) or
    has_role_at_least('admin')`). H5's RPCs are the only writers.

    **Lifecycle.** (1) H5's open RPC creates the attempt and one row per
    question, `answer` and `is_correct` NULL, in ordinal order — rows exist from
    the start, which is what makes the save path a pure UPDATE and gives resume
    a stable set of slots, exactly as `teacher_exam_start()` does. (2) Save
    updates one slot while the attempt is `in_progress`, scoped to
    `auth.uid()`, with one indistinguishable failure message
    (`teacher_exam_save_response()`'s pattern). (3) Submit grades every slot
    through `exam_answer_matches()` — the platform's single grading rule, the
    same call 3e makes — leaves unanswered slots NULL, then flips the attempt
    and computes `late` from `due_at` at that instant; grading comes **before**
    the flip, because the guard freezes answers once the attempt is not in
    progress. (4) After submit the student's feedback read returns, per item,
    their answer, `is_correct`, the teacher's `explanation`, and
    `correct_answer` **only** when `reveal_answers` is true at read time —
    explanation and key come from the RPC, never from a table read, because
    students hold no policy on `teacher_homework_questions`. (5) Nothing is ever
    deleted and nothing is re-graded: once `is_correct` holds a verdict the
    guard refuses to change it.

    **Two findings from the audit, both measured, neither fixed here.**

    1. **The exam system already discloses per item what its RPC withholds.**
       `teacher_exam_submit()` returns counts only, and its comment says why —
       *"an mcq marked wrong is a narrowed key on a paper the teacher may set
       again"*. But `teacher_exam_responses_own_read` plus `grant select`
       lets the student read `is_correct` per item straight from the table.
       Demonstrated on production in an aborting transaction: one graded
       sitting, the student read back `false answer=A ordinal=1`. The key
       itself stayed closed (0 rows from `teacher_exam_questions`) and an
       unrelated student saw nothing, so the boundary that matters holds — what
       leaks is the breakdown the RPC's own rationale says it is withholding.
       For **homework** the same policy is correct, because per-item feedback
       *is* decision 1. For **exams** it is a contradiction between two live
       objects, and it is the exam vertical's decision, not this one's.
    2. **`teacher_exam_responses` has no index beyond its primary key and its
       slot unique**, while the platform's `exam_responses` carries both
       `(attempt_id, ordinal)` and `(question_id)`. The design above follows the
       platform table. Whether 3b should be brought into line is a separate
       observation, recorded, not acted on.

    ### 15.15b · The three post-publish mutable fields — measured, then proposed

    Measured on production in an aborting transaction against the paper table
    and both guards **extracted verbatim** from `20260902b` (cases L01–L24, no
    unexpected results; a first run was refused by
    `teacher_homework_code_check` because the test codes used `I` and `1`, the
    excluded glyphs — the CHECK works):

    | field | draft | published | closed |
    |---|---|---|---|
    | `homework_code` | rotate ok | rotate ok | refused `42501` |
    | `due_at` | set ok | later / earlier / cleared ok | refused `42501` |
    | `reveal_answers` | on and off ok | on ok, **and off again ok** | refused `42501` **both ways** |
    | `title`, `instructions` | edit ok | refused `42501` | refused `42501` |

    **1 · `homework_code` — proposed rule: unchanged.** Mutable in `draft` and
    `published`, frozen once `closed`. Rotation stops the old code and revokes
    nothing (§15.14). One measured hazard is recorded rather than fixed: a code
    the paper has rotated *away* from can later be claimed by a **new**
    homework, because the only uniqueness is on the live value. For exams a
    recycled code merely raises a request a teacher must approve, so the mistake
    is visible; homework has **no queue**, so a recycled code attaches
    immediately and silently. The exposure is bounded — attachment also requires
    active membership of *that* homework's class, so a recycled code can only
    misfire inside the same class, where the teacher is the sole issuer. The
    clean fix (never re-issue a code the workspace has held) needs a retired-code
    record and belongs to **H4**, not to H2.

    **2 · `due_at` — proposed rule: unchanged.** Mutable in `draft` and
    `published`, in either direction, and nullable; frozen once `closed`.
    Decision 3 makes it a date and never a lock, so extending it is the ordinary
    act. History is already immune, and this was measured rather than assumed:
    moving `due_at` thirty days into the future *after* a late submission left
    that attempt `late = true`, and the attempts guard refuses to rewrite the
    flag at all.

    **3 · `reveal_answers` — proposed rule: CHANGE, and it needs approval.**
    Two problems, both measured:

    - A **closed** homework can never reveal its answers (L16), and closing
      while `reveal_answers` is false is permitted (L23). So the ordinary
      marking flow — *due date passes → close the homework → now show the
      answers* — is *impossible*, and a teacher who closes first has locked the
      key away from their class permanently. This collides head-on with
      `20260902b`'s own stated rationale for the field: *"turning answers on
      after everyone has submitted is the normal use"*.
    - While published, `true → false` is allowed (L11). Hiding a key students
      have already read is theatre, and a reversible flag invites a surface to
      treat it as a live permission rather than a decision already taken.

      **APPROVED 2026-09-03:** `reveal_answers` is a **one-way latch** —
      `false → true` only, `true → false` refused in every status — and the
      latch may be thrown in `draft`, `published` **and `closed`**, as the
      single, explicitly named exception to *a closed homework is final*.
      Everything else about `closed` stays final. Implemented in
      `teacher_homework_guard()`; measured below.

      Alternatives, both recommended against: keep `closed` absolutely final and
      require the teacher to reveal before closing (the mistake is then
      unrecoverable and only a UI warning stands between a teacher and it); or
      allow reveal to move both ways while closed (keeps the un-reveal theatre).

    The measured table above is now pinned by `tests/teacher-homework.test.mjs`
    (§17), so a silent change to any of it turns the suite red.

    ### 15.15c · The H2 package — approved, then applied

    Approved 2026-09-03: **`20260902b` + `20260902c` + `20260902d` apply
    together or not at all**, and `20260902y` undoes all three. The rollback is
    safe on a partially applied package — every drop is `if exists`, every count
    `to_regclass`-guarded — which is what makes three statements behave as one
    unit.

    **APPLIED 2026-09-03** as versions `20260903123333` (tables and guards),
    `20260903123410` (RLS) and `20260903123458` (the answer record), in that
    order. Production went 184 → **187 migrations**. `20260902y` stays PREPARED
    and unapplied, and is now a real undo of live schema rather than a
    hypothetical one. **The homework backend has a complete schema and no write
    path: all six tables hold 0 rows and will until H3 ships the authoring
    RPCs.**

    **What the approval changed.** `20260902b` gained a `unique (id,
    homework_id)` on the attempts table and another on the questions table — two
    lines, free only while H2 is unapplied — and its guard gained the latch plus
    a closed gate that names every other column explicitly, so a column added
    later is refused by default rather than quietly joining the exception.
    `20260902d` is new: the answer record, its guard, its RLS and its two
    policies. `20260902c` gained only a header note that its counts are
    point-in-time (five tables, seven policies) because `20260902d` then takes
    the package to six and nine.

    **The invariant is now a foreign key.** An answer names
    `(attempt_id, homework_id)` and `(question_id, homework_id)`, each a
    composite FK onto the keys above. Measured on production: an attempt of
    paper A beside a question of paper B is refused with `23503` naming
    `teacher_homework_responses_question_fk`; with `homework_id` set to B
    instead, refused naming `teacher_homework_responses_attempt_fk`; the
    consistent triple is accepted. No trigger enforces this and none is needed.

    **The latch, measured across every status and both directions:**

    | | draft | published | closed |
    |---|---|---|---|
    | `false → true` | allowed | allowed | **allowed** — the one exception |
    | `true → false` | refused `22000` | refused `22000` | refused `22000` |
    | code / `due_at` | allowed | allowed | refused `42501` |
    | `title` / `instructions` | allowed | refused `42501` | refused `42501` |

    Revealing on a closed paper left `closed_at` and `status` untouched, and a
    single statement that tried to reveal **and** move `due_at` was refused
    outright — the exception is not a trojan.

    **Evidence, all of it measured, none of it applied.**

    - Contract suite 169 checks; `teacher-access-scope` 109; CI 66 of 66.
    - **33 of 33 mutants killed** across all four files — including a deleted
      latch, an inverted latch, a latch scoped to one status, a closed gate
      reverted to refusing everything, both parent keys removed, each composite
      FK degraded to a single column, the omission CHECK dropped, re-grading
      allowed, a timing column and the answer key smuggled onto the response,
      `anon` granted a read, and a rollback that forgets the answer table.
    - **Production dry-run, aborting: 37 probes, 0 unexpected results.** The
      three files applied in order and their own verification blocks passed;
      6 tables / 7 functions / 9 policies / 7 triggers / 17 indexes / 2
      composite FKs; teacher, active assistant (created and activated through
      the real staff RPCs) and platform admin read identically; a member student
      sees no paper and no content but does see their own attachment, attempt
      and answers; an outsider and a pending assistant see nothing; every client
      write is refused `42501` because no write path exists until H3; a late
      submission is accepted and flagged; `weakness_signals`, `exam_mistakes`
      and `exam_practice_sessions` moved by zero inside the transaction.
    - **Rollback rehearsal, aborting: 0 unexpected results.** With one attempt
      and one answer planted the undo refused with exactly *"1 attempt(s), 0
      attachment(s) and 1 answer(s) exist"*; with the plants unwound it returned
      the function, policy, constraint, relation-and-index, trigger and
      client-grant hashes to their exact pre-package values.
    - Production afterwards: 184 applied, newest still `20260902001047`, zero
      `teacher_homework%` objects, the audit log's two rows byte-identical.

    One probe failure is worth recording because it was the guard doing its job:
    the first dry-run attempt published each paper *before* writing its content,
    and `teacher_homework_content_guard()` refused — content belongs to a draft.
    The probe was reordered; the migration was not touched.

    **Still out of H2, deliberately.** The retired-code hazard (a code a paper
    rotated away from can be claimed by a new homework) stays an **H4**
    decision; solving it needs a retired-code record and would mix access and
    code lifecycle into the base schema.

    ### 15.15d · Post-apply verification, 2026-09-03

    Run before anything else, in the order the owner set.

    **Structure, compared against values pre-computed from the repo files** —
    not against the paste that was applied, which is the point. All **seven
    function bodies** are byte-identical (`md5(prosrc)`, which keeps comments, so
    the 3b failure mode of a paste that silently dropped inline comments would
    have shown up here). Six tables; 51 constraints = the 36 named in the files
    plus 15 auto-generated (28 check, 6 unique, 6 pkey, 11 fkey); 17 indexes;
    7 triggers, all BEFORE; RLS on all six; 9 policies, none of them anything but
    SELECT; `SELECT` to `authenticated` the only client table grant and `anon`
    holding nothing; every definer function's `search_path` pinned; and
    `teacher_homework_is_staff` the only function any client may EXECUTE.

    **Behaviour on the live schema — 21 checks, 0 failures,** in an aborting
    transaction so no row survived it:

    - *Cross-homework integrity.* An attempt of paper A beside a question of
      paper B refused `23503` naming `..._question_fk`; the same pair with
      `homework_id` set to B refused naming `..._attempt_fk`; an omission
      recorded as wrong refused `23514` on the omission CHECK.
    - *The latch, all six combinations.* draft / published / **closed**
      `false → true` all allowed; `true → false` refused `22000` in every
      status. Revealing on a closed paper left `status` and `closed_at`
      untouched. A single statement revealing **and** moving `due_at` was still
      refused `42501` — the exception is not a trojan.
    - *Access scopes.* Teacher and **ACTIVE assistant** identical (8 papers,
      2 questions, 1 attempt, 1 answer); the **pending** assistant, created
      through the real `staff_join_workspace()` RPC, saw nothing; an outsider saw
      nothing; a member student saw no paper and no content but did see their own
      attachment, attempt and answer.
    - *No write path.* Teacher INSERT, staff UPDATE of an answer, a student
      revealing answers, and an `anon` read all refused `42501`.

    **What did not move.** Analyzer counters `893/11/24` before and after; the
    audit log still 2 rows at md5 `9ff25122…`; the 21 enum labels unchanged; the
    `teacher_exam*` tables still empty; every homework table at 0 rows.

    **New production baseline** for the next session to compare against:
    constraints `44e9608c…`, policies `370ff326…`, relations `a5e244f2…`,
    triggers `3da9d509…`, client grants `e1f0bb57…`, counts 186 functions /
    133 policies / 82 tables.

    ### 15.16 · H3 — the authoring RPCs (PREPARED 2026-09-03)

    The first write path into the homework schema. Until H3, the six tables were
    governed and unreachable: clients hold SELECT only and H2 shipped no callable
    function. `20260903a` adds **thirteen RPCs** a teacher or active assistant may
    call and **two helpers nobody may**; `20260903z` removes all fifteen and
    nothing else. Neither is applied.

    **Audited first, from production rather than from the repo.** Every 3c exam
    authoring RPC was read out of `pg_proc` and compared against what Homework
    needs. What mirrors, unchanged: the staff gate and its ONE indistinguishable
    refusal (`no such homework, or you are not staff of its class` — the id is
    never an oracle); draft-only content edits, where the RPC exists to turn a
    trigger's message into one a teacher can act on while the trigger stays the
    thing that cannot be bypassed; the bounded code-retry that catches **only** a
    code collision by constraint name and re-raises everything else; the
    ordinal-shift that dodges the slot unique; the all-or-nothing reorder; the
    server-side `media_sha256` with any client value never read; the audit-log
    insert shape.

    **Four divergences, each traceable to a decision:**

    | | why |
    |---|---|
    | no duration, calculator, `opens_at`, `closes_at` | homework is untimed; publishing opens it |
    | `due_at` has its **own** RPC | it is mutable while published (§15.15b), so folding it into the draft-only update would make one function hold two lifecycles |
    | `reveal_answers(p_homework)` takes **no boolean** | the latch is one-way; with no parameter, un-revealing is not a call the API can express, which is stronger than a guard refusing it. It is also the one RPC a **closed** homework accepts |
    | publish has no window/duration gate, and no `due_at` gate | there is no window, and decision 3 makes `due_at` a date and never a lock — so publishing with it already past is legal and describes a homework where every submission is late |

    **The audit labels constrain what H3 may log.** 20260902a shipped five;
    `homework_attached` is H4's. So exactly four are written — created, published,
    closed, code_rotated — and update, delete, content edits, reorder and reveal
    write **nothing**, because no label exists for them. That is a consequence of
    the label set, not a choice made here, and **one of the four silences deserves
    a decision: revealing the answers is irreversible and invisible in the audit
    log.** Adding a label is another irreversible enum migration, so it is raised
    here rather than smuggled into H3.

    **Evidence, none of it applied.** Contract suite 222 checks (H3 adds nine
    sections); scope suite 109; CI 66 of 66. **44 of 44 mutants killed** — a
    deleted staff gate, a role-aware gate, a refusal turned into an oracle, a
    draft-only `set_due_at`, `due_at` folded back into the update, a reveal that
    can un-reveal, a reveal with a status gate, each publish check removed in
    turn, a publish that refuses a past due date, a retry that swallows every
    unique violation, an ambiguous glyph in the alphabet, a partial reorder, a
    trusted client hash, a dropped SVG sniff, a helper granted to clients, an RPC
    granted to `anon`, a lost `security definer`, an RPC reaching into the student
    tables, and four rollback mutants. Two survivors were fixed by *strengthening
    the tests*: `fnDef()`'s head begins after the parameter list, so a widened
    signature was invisible — every signature is now pinned; and the SVG sniff had
    never been asserted at all.

    **Production dry-run, aborting: 30 probes, 0 unexpected results.** The whole
    flow driven through the RPCs as real identities — create (title trimmed),
    update, one stimulus and three questions through the borrowed validators, a
    figure in use refusing deletion, a partial reorder refused and a full one
    renumbering 1..3, a delete closing the gap to 1,2, an empty paper refused
    publication, publish with a past due date **allowed**, then title/content/
    delete all refused while `due_at`, code rotation and reveal all still work;
    close, and then **a closed paper still revealing its answers with `status` and
    `closed_at` untouched** while `due_at` and rotation are refused; a
    cross-homework figure refused; a non-SVG figure refused; an internal helper
    not client-callable; an outsider and a **pending** assistant refused; an
    **active** assistant driving create → publish → close → reveal end to end;
    `anon` refused. Ten audit rows, exactly the four labels, no `homework_attached`.
    `teacher_homework_access` / `_attempts` / `_responses` all still 0 — authoring
    touches no student table.

    **Rollback rehearsal, aborting: 8 checks, 0 failures.** All fifteen bodies
    byte-identical to the file (`md5(prosrc)` against values pre-computed from the
    repo); 22 homework functions while H3 stood (7 from H2 + 15); after
    `20260903z`, the function, policy, constraint, relation-and-index and trigger
    hashes and the 186/133/82 counts all back to baseline.

    ### 15.16a · The two governance audits, 2026-09-03 (measured, nothing changed)

    Both run on production in aborting transactions, with
    `teacher_homework_delete` created verbatim from `20260903a` and everything
    else driven as `postgres`, so the probes measure the DATABASE's behaviour —
    guards and foreign keys — rather than the RPC's opinion of it.

    #### The delete truth table

    | what is being deleted | result |
    |---|---|
    | an **empty** draft | **deleted** |
    | a draft with a **figure** | **REFUSED** `42501` *teacher_homework_stimuli: homework (unreadable) is (unknown) and its content is immutable* |
    | a draft with **questions** | **REFUSED** `42501`, same message |
    | a draft with an **attachment** | REFUSED — *an attachment is a record and is never deleted* |
    | a draft with an **attempt** | REFUSED — *an attempt is a record and is never deleted* |
    | a draft with an **answered attempt** | REFUSED |
    | a **published** paper | REFUSED by the RPC — *close it, do not delete it* |
    | a **closed** paper | REFUSED by the RPC — same |

    **The mechanism.** PostgreSQL deletes the parent row first and then runs the
    referential-action cascade, so when a child's BEFORE DELETE guard fires the
    parent is already gone. `teacher_homework_content_guard()` reads the parent's
    status, finds NULL, and — correctly, by its own fail-closed design — refuses.
    The guard is not wrong. The consequence is that **only a completely empty
    draft can ever be deleted**, and a teacher who added one question to a draft
    can never delete it, with an error message that says *(unreadable)* and
    *(unknown)*.

    **This contradicts the locked lifecycle**, which permits deleting a draft and
    forbids it only from publication onward. It is not a new hazard introduced by
    H3 — H2's applied guard produces it — but H3 is the first increment that
    exposes it, because H3 is the first thing that can delete anything.

    **Recommended fix, entirely inside the PREPARED H3 file, with no change to
    applied H2 SQL:** `teacher_homework_delete` deletes the paper's questions and
    then its stimuli *before* the paper itself. While the parent still exists and
    is a draft, the content guard permits both; with no children left, the parent
    delete triggers no cascade. The fail-closed guard is untouched, and a draft
    carrying student rows still refuses — which is correct and should stay.

    Two alternatives, both worse: weakening the content guard to tolerate a
    missing parent (it would stop failing closed, the property it exists for), or
    documenting "empty the paper first" and leaving a teacher facing an
    *(unreadable)* error. **No SQL was changed pending this decision.**

    #### A structural finding: three cascades that can never fire

    `teacher_homework_access`, `_attempts` and `_responses` each declare
    `on delete cascade` on their homework/attempt foreign keys, and each carries a
    BEFORE DELETE guard that refuses **unconditionally**. Measured: a direct
    delete of an attachment, an attempt and an answer are all refused `42501`. So
    those cascade clauses are unreachable — dead metadata that reads like a
    behaviour. Harmless today, and worth knowing before anyone relies on it.

    #### What a reveal leaves behind

    Measured on the live schema: throwing the latch writes **no audit row**
    (`workspace_audit_log` unchanged), sets `reveal_answers = true`, and stamps
    `updated_at`. The only actor column on `teacher_homework` is `created_by` —
    there is no `updated_by`, `revealed_by` or `revealed_at`. And `updated_at` is
    stamped by *every* accepted update, so a `due_at` change and a reveal are
    indistinguishable by timestamp.

    So after a reveal the database can say *the answers are revealed*, and cannot
    say **who revealed them, or when**. Teacher and every active assistant hold
    identical power here by locked decision 5, so "who" is a real question with
    more than one possible answer.

    **Recommendation: add `homework_answers_revealed` as its own H1-style enum
    migration, applied BEFORE H3**, and have `teacher_homework_reveal_answers()`
    write it. Reasons: the act is irreversible; several people can perform it;
    and three of the four other consequential acts — created, published, closed,
    code_rotated — are already logged, so the omission is an accident of the
    label set rather than a decision. The cost is the one that always applies to
    enum labels: a new label can never be dropped, and it cannot be written until
    the migration adding it has committed, which is exactly why it must be its
    own step rather than part of H3.

    **`homework_deleted` is NOT recommended.** The truth table above shows a
    delete can only ever destroy an empty draft — no questions, no figures, no
    student rows. Logging the disposal of something that contained nothing buys
    an irreversible label for no evidence.

    **One thing not yet exercised:** the in-file verification block in
    `20260903a` §6 runs at apply time and has not been executed. Its one
    live-dependent assertion — that H2's `teacher_homework_is_staff` was not
    redefined — was checked directly: the live `md5(prosrc)` equals the constant
    the file compares against. A failure there would abort the apply and roll it
    back, not corrupt anything.

    ---

    **One observation recorded, not resolved.** `exam_practice_sessions` read
    **23** during the pre-apply dry-run and **24** shortly afterwards. The extra
    row is a real student's session (started 23:03:01, ended 23:03:36, score 700,
    EST_MATH_1) timestamped roughly thirteen hours *before* the dry-run, so it
    should have been counted then too, and no row was created during any of this
    work — every probe transaction aborted. It is logged here as a
    concurrency/data observation, **not** attributed to H2 and **not** modified.
    The count was `24` both immediately before and immediately after the apply.

    ### 15.16b · The revised H3 package, 2026-09-03 (PREPARED, unapplied)

    Both recommendations from §15.16a were approved and implemented. The
    increment is now **two files applied in order**, and the order is a real
    dependency rather than a filing convention.

    #### 1 · `20260903a` — one audit label, on its own

    `homework_answers_revealed`, appended, `if not exists`, and nothing else:
    no table, column, policy, function, grant or row. It is a separate migration
    for the reason `20260902a` was: PostgreSQL runs `alter type … add value`
    inside a transaction but **refuses to cast the new label until that
    transaction commits**, so a migration that adds a label and then writes it
    cannot work as one unit. That is not a claim from the manual — it was
    measured twice on production, from both directions: with the label added in
    the same transaction the real RPC raised `55P04 unsafe use of new value`,
    and with the label never added it raised `22P02 invalid input value for
    enum`. Either way the RPC's insert genuinely targets the new label, which is
    what those probes were for.

    The writing convention, matching `20260902a`'s exactly: `actor_id` is
    `auth.uid()`, `subject_id` is NULL (its subject is a paper, and the column
    references `auth.users`), `meta` carries `{'homework_id': …}`, and the
    timestamp is the log's own column default. Exactly one label — there is no
    `homework_answers_hidden`, because un-revealing is not a call the API can
    express, and no label for update, delete or content edits, because those
    have no label today and inventing one here would be smuggling H4's decisions
    into H3.

    Like every enum migration before it, **it is not cleanly reversible** — there
    is no `ALTER TYPE … DROP VALUE`. `20260903z` drops and recreates the type
    around the live column and refuses outright if any row already records the
    label.

    #### 2 · `20260903b` — the authoring RPCs (renamed from `20260903a`)

    Thirteen client RPCs and two helpers, unchanged in shape from §15.16, plus
    the two approved changes:

    **The delete fix.** A draft with content is now deletable, because the RPC
    removes the questions and stimuli itself, in that order, **while the parent
    row still exists**. §15.16a measured why the cascade could not: PostgreSQL
    deletes the parent before running the referential cascade, so
    `teacher_homework_content_guard()` fires with the parent already gone, reads
    a NULL status and fails closed. The guard is not weakened, bypassed or
    touched — it now simply evaluates a real `draft` status and permits the
    write. Anything a student holds still refuses, and refuses with a count
    rather than a trigger's message.

    **The reveal audit write.** `teacher_homework_reveal_answers()` writes one
    `homework_answers_revealed` row per reveal that actually moved the latch.
    The clause that makes that true is `and not reveal_answers` in the UPDATE:
    a second call on an already-revealed paper matches no row, so `v_ws` stays
    NULL and the function returns before the INSERT. A refused call never
    reaches it at all.

    #### What the production dry-runs found

    Five aborting passes. The first two found real defects in the file's own
    verification block — both of which would have failed the apply, and neither
    of which any static test could have caught:

    - **§6.6 forbade the mention, not the write.** It rejected any H3 function
      whose source so much as named `teacher_homework_access` or `_attempts` —
      which the approved delete pre-check must do. Now it forbids the three
      write verbs against those tables, and separately confines the *read* to
      `teacher_homework_delete`. A read whose only outcome is a refusal is not a
      student surface; a write is.
    - **§6.8 could only ever go red.** It compared
      `pg_get_function_identity_arguments()` against `'uuid'`, and that function
      never returns `'uuid'` — it includes the parameter name (`p_homework
      uuid`). The file could not install at all. It now reads the argument
      **types** (`unnest(proargtypes)`), which is also name-independent. The
      verification-framework rule has a mirror image, and this is it: *a check
      that cannot go green is as useless as one that cannot go red, and rather
      more expensive.* Only running the file finds one — which is what a dry-run
      is for. This line was introduced by the original H3 prepare commit, so the
      30-probe dry-run recorded in §15.16 did not exercise the file as
      committed; the evidence below replaces it rather than adding to it.

    A third finding is user-facing rather than structural. The delete refusal
    said *"this homework is % — close it, do not delete it"* for **both**
    non-draft statuses, so a teacher deleting a closed paper was told to close
    it. H3 now gives each status its own message. **The wording was inherited
    verbatim from `teacher_exam_delete()` in `20260901e`, which is LIVE and
    still says it** — recorded here as a defect in the exam RPC, not fixed by
    this increment, because changing a live function needs its own approval.

    **The evidence, after those fixes.** All 15 bodies installed byte-identical
    to the file (`md5(prosrc)` against values pre-computed from the repo), and
    the file ran to the end of its own §6.1–6.9 verification.

    | probe | result |
    |---|---|
    | empty draft, deleted | DELETED, 0 rows left |
    | draft with 1 stimulus + 2 questions | DELETED, paper/questions/stimuli all 0 |
    | draft with an attachment | REFUSED 42501, naming `1 student(s) hold this` |
    | draft with an attempt | REFUSED 42501, naming `1 have started it` |
    | draft with an attempt **and a graded answer** | REFUSED 42501 |
    | published | REFUSED — *close it, do not delete it* |
    | closed | REFUSED — *can no longer be deleted* (never "close it") |
    | outsider | REFUSED 42501, no such homework |
    | active assistant | DELETED (parity) |
    | every student row after the refusals | untouched: access 1, attempts 2, answers 1 |

    The reveal event was measured with a **shadow** of the live body differing
    in exactly one label literal — necessary because the real label cannot be
    cast in the transaction that adds it. Pass 4's shadow borrowed
    `homework_created`, the label `create()` also writes, and since every row in
    one transaction shares `now()`, ordering could not tell the two apart; pass
    5 used `exam_access_requested`, which nothing else in the run writes, and
    proved the body it tested hashes to the repo value.

    | probe | result |
    |---|---|
    | teacher reveals a draft | latch true, **+1** audit row |
    | that row | workspace correct, actor = the revealing teacher, `subject_id` NULL, `meta` = `{"homework_id": …}` and nothing else |
    | its timestamp | the column default (equals the transaction's `now()`); the RPC passes no `created_at` |
    | two further calls on the same paper | **+0** rows, total stays 1 |
    | an outsider reveals | REFUSED 42501, **+0** rows, latch untouched |
    | an active assistant reveals | **+1** row, actor = the assistant |
    | a CLOSED paper reveals | latch true, status still `closed`, `closed_at` kept, **+1** row |
    | un-reveal, as the table owner | REFUSED 22000 — the latch holds below the API |
    | ledger | P1=1 P2=1 P3=1 P4=0; every row has an actor and a homework, none has a subject |

    #### Rollback rehearsals

    `20260903y` (the RPCs): installed H3, then undid it, in one aborting
    transaction. Homework functions went **7 → 22 → 7**, and all nine hashes —
    function signatures, bodies, ACLs, constraints, policies, relations,
    triggers, table grants, counts — came back **identical** to their
    pre-install values, **0 differing**. The install moved exactly the three it
    should (signatures, bodies, ACLs) and left constraints, policies, relations,
    triggers and grants untouched, which is what makes "H3 adds no schema" a
    measurement rather than a claim.

    `20260903z` (the label): the label list returned to the **same md5** as
    before the add, `homework_answers_revealed` was gone, the log was
    byte-identical and back **on** the type, and the dropped label was refused
    again on a fresh insert. Its refusal path was rehearsed with a **stand-in**
    label (`exam_access_rejected`) planted in the log — the real literal cannot
    be planted in the transaction that adds it — and it refused with the
    intended message; the literal itself is pinned by the contract suite.

    ### 15.16c · H3 APPLIED, 2026-09-03 — and verified after the fact

    Applied in the required order, as two separate transactions:

    | file | version | what it added |
    |---|---|---|
    | `20260903a` | `20260903175543` | one enum label, `homework_answers_revealed` |
    | `20260903b` | `20260903175957` | 13 client RPCs + 2 helpers; no table, policy or type |

    Between the two, the label was read back **committed and castable** — the
    one test `20260903a`'s own verification block said it could not perform,
    because a new enum value is unusable until its transaction commits. That
    is the whole reason the increment is two files, and the gap between them is
    where the proof lives.

    #### Structural

    All **15 bodies byte-identical** to `20260903b` (`md5(prosrc)` against
    values pre-computed from the file). All 13 client RPCs are `SECURITY
    DEFINER` with `search_path` pinned and `authenticated` holding EXECUTE; the
    two helpers are callable by nobody; `anon` holds EXECUTE on nothing
    homework-shaped. `teacher_homework_is_staff` still hashes to
    `63ef7fa2…` — H2's helper was called, never redefined. The enum stands at
    **22 labels with the new one at position 22 and the prior 21 in their
    original order**, compared as one exact string rather than a count.

    **The schema hashes did not move.** Constraints `f0c920cc…`, policies
    `222a2ad9…`, relations `53ff18a8…`, triggers `e755accf…`, table grants
    `2d610a2a…` are each byte-identical to the values measured *before* the
    install during the rollback rehearsal. "H3 adds no schema" is therefore a
    measurement, not a claim. Public functions went 186 → **201** (+15);
    policies stayed **133**, tables **82**.

    #### Behavioural, on the live functions, in an aborting transaction

    The delete lifecycle, all nine cases:

    | case | result |
    |---|---|
    | empty draft | DELETED |
    | draft with 1 stimulus + 2 questions | DELETED — paper, questions and stimuli all gone |
    | draft + attachment | REFUSED `42501`, *1 student(s) hold this homework* |
    | draft + attempt | REFUSED `42501`, *1 have started it* |
    | draft + attempt + **graded answer** | REFUSED `42501` |
    | published | REFUSED — *close it, do not delete it* |
    | closed | REFUSED — *can no longer be deleted* (never "close it") |
    | outsider | REFUSED `42501`, no such homework |
    | active assistant | DELETED — parity |
    | student rows after every refusal | untouched: access 1, attempts 2, answers 1 |

    The reveal lifecycle, driven by the **real RPC** — no shadow was needed this
    time, because the label was already committed:

    | case | result |
    |---|---|
    | teacher reveal | latch `true`, **+1** event |
    | the row | workspace correct · actor = the revealing teacher · `subject_id` NULL · `meta` exactly `{"homework_id": …}` · `created_at` = the transaction's `now()`, from the column default |
    | two further calls | **+0** events; total for that paper stays **1** |
    | outsider reveal | REFUSED `42501`, **+0** events, latch untouched |
    | active assistant reveal | **+1** event, actor = the revealing assistant |
    | closed homework reveal | latch `true`, status still `closed`, `closed_at` kept, **+1** event |
    | un-reveal, as table owner | REFUSED `22000` |
    | ledger | R1=1 R2=1 R3=1 R4=0; every row has an actor and a homework, none a subject |

    Refusals by everyone who is not active staff: a **pending assistant**
    cannot create, edit or reveal; an enrolled **student** cannot create or
    publish; an **outsider** cannot rotate a code; **anon** gets *permission
    denied for function* on both create and reveal — the ACL, not the gate; and
    even a signed-in teacher gets *permission denied* on the internal helper.

    Nothing survived: the six homework tables are back at **0 rows**, the audit
    log at **2 rows** carrying no homework label, and the analyzer unmoved at
    **893 / 11 / 24**. `homework_attached` remains at 0 — that label is H4's.

    #### New production baseline (2026-09-03, post-H3)

    189 migrations, newest `20260903175957` · 6 homework tables, 9 policies,
    **22** homework functions (7 from H2 + 15 from H3) · 201 public functions ·
    133 public policies · 82 tables · 22 enum labels · homework function bodies
    `460b13a8…`, signatures `b49d7d17…` · constraints `f0c920cc…`, policies
    `222a2ad9…`, relations `53ff18a8…`, triggers `e755accf…`, grants
    `2d610a2a…`.

    Both rollbacks stay PREPARED and unapplied: `20260903y` (rehearsed, 7 → 22
    → 7 with 0 differing hashes) and `20260903z` (rehearsed; note its own
    warning has now come true — with `20260903b` live, undoing the label means
    running `20260903y` first).

    **There is still no student write path.** H4 opened as audit-only the same
    day and is recorded in §15.17.

    ### 15.17 · H4 — the audit, and the package it produced (PREPARED)

    #### The live facts the audit measured

    Everything here was read from production, most of it in aborting
    transactions, before a line of H4 was written.

    - **The two access tables are deliberately different shapes.**
      `teacher_exam_access` carries `state`, `was_member_at_request`,
      `decided_at`, `decided_by`; `teacher_homework_access` has three columns
      and no state. §15.14 is why.
    - **`teacher_homework_access_guard` refuses every UPDATE and every DELETE,
      unconditionally** — measured as the table owner: `22000` and `42501`.
      INSERT is the only operation it permits, so an attachment is write-once
      forever and there is no un-attach without a new migration.
    - **No student read policy exists** on `teacher_homework`, its questions or
      its stimuli: a member student reads 0 papers, 0 questions, 0 stimuli. The
      exam system is identical — every student-facing read is a definer RPC. So
      H4 needs **no new policy**.
    - **Three findings changed the design.** The two audit disciplines in
      production disagree (`student_join_workspace` writes a `student_joined`
      row on *every* call — three joins measured **+3** rows for one
      membership — while `student_request_exam_access` logs only a new row).
      **Removal is undone by the student**: `teacher_remove_student` sets
      `removed`, and re-entering the same class code sets it straight back to
      `active`, so rotating the class code is the real revocation. And the
      **retired-code hazard is real and was demonstrated**: rotation frees the
      old code, nothing reserves it, and a *different* homework was accepted
      when given that exact value.
    - **There is no rate-limit infrastructure, no scheduler and no retention
      convention anywhere in this database.** No `pg_cron`, no job, no
      cleanup/purge function; `student_request_exam_access` is the only
      function that does a time-window count, and `ai_usage_logs` — the one
      live counting table — has never had a row deleted. Any retention H4
      defines is therefore a new convention, and one that must run inside the
      RPC or not at all.

    #### Two approved corrections, and the one that could not be copied

    1. **`teacher_homework_retired_codes`** — permanent, not a TTL. It carries
       **no foreign key**, because a cascade would free the code the moment its
       draft was deleted, which is the hazard itself.

       **The invariant was then widened, and locked:** *once a homework code
       has existed, it never becomes available again.* A code leaves
       circulation by **both** exits — rotation retires the old value, and
       **deleting a draft retires its code before the row goes**. Deletion
       counts even though a draft's code grants nothing, because a draft code
       can still have been read aloud or forwarded, and reissuing it produces
       exactly the wrong-paper attachment the table exists to prevent.
       Published and draft are not distinguished: code identity has nothing to
       do with status. That made `teacher_homework_delete()` the **third** live
       H3 function H4 redefines.

       Both exits are atomic — rotation writes the new code and the reservation
       in one transaction, deletion writes the reservation and removes the row
       in one — so there is no instant at which a code is neither held by a
       live homework nor reserved, which is what stops a concurrent create
       slipping between them.

       **What enforces it.** The three RPCs on every path a client can reach,
       and `teacher_homework_code_guard()` in the database itself:

       ```sql
       create trigger teacher_homework_code_guard_trg
         before insert or update of homework_code on teacher_homework
         for each row execute function teacher_homework_code_guard();
       ```

       The trigger exists because the first version did not have one and the
       dry-run measured the consequence: a raw INSERT carrying a retired code
       was **ACCEPTED**, since the UNIQUE on `homework_code` cannot see the
       reservation table and a CHECK may not subquery. Clients hold no INSERT
       on `teacher_homework`, so nothing reachable today could do it — but an
       invariant that depends on nobody currently holding a grant is an
       application rule wearing a database rule's clothes. **Measured again on
       the live schema on 2026-09-03, before the guard: a raw INSERT of a
       rotated-away code was accepted, and the only thing that ever refused
       such a write was the UNIQUE, and only once some other row already held
       the value.** The guard is `SECURITY DEFINER` with a pinned
       `search_path`, so RLS on the reservation can never blind it, and it is
       callable by nobody. It raises `22000` rather than `23505` on purpose:
       `teacher_homework_create()` catches `unique_violation` to retry a
       collision, and a RAISE carries no `constraint_name`, so a 23505 would
       enter that handler only to be re-raised opaquely.

       **It covers BOTH write verbs.** An earlier version was INSERT-only,
       which left the identical hole behind a different door — a raw UPDATE to
       a retired value — and an invariant enforced on one write verb and not
       the other is not enforced. One unconditional check on
       `new.homework_code` serves both, because that is the code the row is
       about to carry either way, and a row's own live code is never in the
       reservation (retirement always accompanies the code *leaving* the row),
       so rewriting the column to its current value still passes.

       `UPDATE OF homework_code`, not a bare `UPDATE`: the guard must not fire
       on the title, the due date, the status transitions or the reveal latch,
       all of which H2 governs and none of which can put a code on a row.
       **This was measured discriminating rather than assumed** — the dry-run
       plants a row's own LIVE code in the reservation, a state the RPCs can
       never produce, so a guard with the wrong scope would refuse every write
       to that row; the title, `due_at`, publish and reveal writes were all
       accepted while a write naming the column with that same value was
       refused `22000`.

       **Rotation still works, and the order is why:** the RPC installs the NEW
       code first (not retired, so the guard passes) and retires the OLD one
       afterwards. Rotating A → B and later back to A is therefore refused,
       which is the invariant doing its job rather than a regression.

       Both triggers now fire on an update of the code column, the code guard
       first — BEFORE ROW triggers fire in alphabetical name order and
       `teacher_homework_code_guard_trg` sorts before
       `teacher_homework_guard_trg`. Measured, not inferred. H2 still sees
       every update it saw before and none of its own rules move: a raw code
       write on a CLOSED paper is still refused `42501` by H2's guard.
    2. **`teacher_homework_attach_attempts`** — every submission counted, not
       just successful attachments. It holds who and when and nothing else: not
       the submitted code, not the outcome, because storing the outcome would
       make the table the oracle the one-reason rule exists to prevent.

    **The defect a probe caught before any of it ran.** The attach RPC as first
    written recorded the attempt and then RAISED `'that code did not match'`.
    Measured on production: a row inserted by a function that then raises does
    **not** survive the raise (0 rows), while the same insert followed by a
    return does (1 row). The limiter would therefore have counted only
    successes — silently reproducing the exact exam blind spot H4 was approved
    to fix. Every **expected** refusal now RETURNS `{ok:false, reason:…}`; the
    rate limit is the one refusal that still raises, deliberately, because
    discarding its own row is what stops a throttled caller growing the table.

    #### The contract

    ```
    attach(code):  signed in -> rate limit -> resolve a PUBLISHED homework in
                   an ACTIVE class -> not active staff -> ACTIVE member ->
                   attach -> audit once

    can_open(hw) = attached AND active membership AND active workspace
                   AND published          -- all live, none cached, no due_at
    ```

    `teacher_homework_can_open()` takes **no student parameter**: one would let
    any account probe another student's access. A wrong code, a draft, a closed
    paper, a deactivated class and a real code held by a non-member all return
    the identical `no_match`; only staff get a distinct reason, and safely,
    since staff already read every code in their class.

    #### Evidence (all aborting)

    | probe | result |
    |---|---|
    | member attaches, code typed lowercase with spaces | `{ok:true, reason:attached}` |
    | the same code again | `already_attached`, **+0** audit events, still 1 access row |
    | the audit row | actor = the student, `subject_id` = the student, `meta` = `{homework_id}`, timestamp from the column default |
    | outsider · pending assistant · draft · closed · deactivated class · garbage | `no_match` for all six, **+0** access rows |
    | teacher · active assistant | `staff` |
    | **14 wrong codes in a row** | 10 accepted, then `53400` — and **10 attempt rows recorded**, where the exam limiter would hold 0 |
    | 5 rows planted 3 hours old, then one call | pruned to 1 — the only sweep that can run |
    | removed student | `can_open` false, attachment kept, re-attach `no_match` |
    | rejoins the class, then attaches | `can_open` true again |
    | rotation | old code reserved, retired code `no_match`, `code_available` false |
    | draft created | its code unavailable to anyone else |
    | draft **with content** deleted | rows gone, code retired, `code_available` false |
    | empty draft deleted | code retired too |
    | student presents a deleted draft's code | `no_match` — indistinguishable from any other miss |
    | deleting a draft a student holds | REFUSED, and **+0** reservations: a refusal retires nothing |
    | reservation / attempt row, as table owner | UPDATE and DELETE both refused |
    | **raw INSERT with a retired code, as table owner** | **REFUSED `22000`** — the guard, and the reason it exists |
    | raw INSERT with a deleted draft's code | REFUSED `22000` |
    | raw INSERT with a LIVE code | REFUSED `23505` — the UNIQUE, a separate mechanism |
    | raw INSERT with a fresh code | ACCEPTED — the guard blocks nothing ordinary |
    | **raw UPDATE to a retired code** | **REFUSED `22000`** — the second write verb, and the same message |
    | raw UPDATE to a retired code, on a *different* row | REFUSED `22000` — it is the CODE that is refused, not the row that retired it |
    | raw UPDATE to a deleted draft's code | REFUSED `22000` |
    | raw UPDATE to a FRESH code | ACCEPTED, row carries it — the guard blocks nothing ordinary |
    | raw UPDATE to a code a LIVE row holds | REFUSED `23505` — the UNIQUE, untouched and still a separate mechanism |
    | raw UPDATE of the column to its OWN current value | ACCEPTED — a row's own live code is never reserved |
    | title / `due_at` / publish / reveal, with the row's own code planted in the reservation | all ACCEPTED — the guard did not fire, so the column scope is real |
    | the same row, naming `homework_code` with that same planted value | REFUSED `22000` — so the four above measure the SCOPE, not a sleeping guard |
    | raw code UPDATE on a CLOSED paper | REFUSED `42501` — H2's guard still fires on the code column |
    | trigger firing order on `teacher_homework` | `teacher_homework_code_guard_trg` **then** `teacher_homework_guard_trg` |
    | triggers on `teacher_homework` after install | 2 — H2's, plus the guard, H2's body unchanged |
    | duplicate attachment, raw | `23505` — the PK is what makes a real concurrent double-attach safe |
    | teacher closes the paper | `can_open` false |
    | outsider calling the staff roster · anon calling attach | `42501` |
    | analyzer, attempts, responses | 893/11/24 unmoved; 0 and 0 |

    A second defect the dry-run caught: the rowtype variable `h` collided with
    the table alias `h`, and plpgsql refuses that (`42702`). The alias is now
    `hw` and the suite pins it.

    **A third, and it is the H3 lesson's mirror image.** The re-run of the
    dry-run after the guard was widened refused to install the file at all:

    ```
    ERROR: H4: student_attach_homework() records membership at attach time
    ```

    §7.8 asserts the attach body never records `was_member_at_request` — and
    the body says those exact words, in a comment, *in order to say it does not
    use them*. The check read `prosrc` whole, so it was reading prose, and on
    the file as written it could **only** ever raise. H3's dry-run found a
    check that could only ever raise for a different reason (`§6.8` compared
    `pg_get_function_identity_arguments()` against a value that function never
    returns); this is the same class of defect reached from the other side, and
    it means the file as previously committed could not have been applied.

    Every §7 source check now reads the installed body with its `--` comments
    stripped, and the raw `prosrc` is **not held in a variable at all**, so a
    later check cannot reach for it. Two mutants pin it: one inlines a raw
    `p.prosrc` read, one drops the stripping from a single check. The contract
    suite asserts, over §7 as a whole, that the only remaining reads of
    `p.prosrc` are stripped ones and whole-body `md5()` comparisons.

    **Paste fidelity was measured, not assumed.** Each of the eleven function
    bodies installed by the dry-run was compared against an md5 computed from
    the repo file before the run: **11/11 byte-identical**. That is the check
    the H3 apply lacked when a paste silently stripped inline comments.

    **Rollback rehearsal** (re-run 2026-09-03 against the widened guard).
    Homework tables, functions and triggers-on-`teacher_homework` went
    **6,22,1 → 8,28,2 → 6,22,1**, and all eight hash families —
    `constraints`, `policies`, `relations`, `triggers`, `grants`,
    `hw_bodies`, `hw_sigs` and the six counts — returned **identical,
    0 differing**, with all **three** H3 bodies restored byte-for-byte. The
    guard sits on a table that survives the rollback, so it is dropped by
    name — trigger before function — and the rollback asserts
    `teacher_homework` is back to H2's single trigger, `BEFORE DELETE OR
    UPDATE`, with its body unchanged. The refusal was exercised both ways in
    one transaction: with **0** reservations the block proceeds, and with
    **1** planted it refuses naming the count — so it is a condition that can
    go green as well as red.

    #### H4 IS LIVE — applied 2026-09-03 as version `20260903203209`

    One file, one transaction, no enum migration: `homework_attached` has been
    committed and castable since `20260902a`, which was confirmed by reading it
    back before the apply. The file's own §7 block ran as part of the apply, so
    the migration could not have committed with any of its assertions red.

    **Structure.** The trigger reads back exactly as written:

    ```
    CREATE TRIGGER teacher_homework_code_guard_trg
      BEFORE INSERT OR UPDATE OF homework_code ON public.teacher_homework
      FOR EACH ROW EXECUTE FUNCTION teacher_homework_code_guard()
    ```

    H2's own trigger is beside it, unmoved: `BEFORE DELETE OR UPDATE ON
    public.teacher_homework`, body still `19bbc18c…`, and
    `teacher_homework_is_staff` still `63ef7fa2…`. Both new tables have RLS on,
    **no policy and no grant to `anon` or `authenticated`**; the reservation
    carries a PRIMARY KEY and the code CHECK and **no foreign key**; the limiter
    carries its primary key and the `(user_id, attempted_at desc)` index.

    **All eleven installed bodies are byte-identical to the repo file** — md5
    compared against values computed from `20260904a` before the apply, which
    includes the three redefined H3 functions now at their H4 values
    (`4fca434e…`, `124b4acb…`, `f7f430e2…`). Every one is `SECURITY DEFINER`
    with `search_path` pinned; the four client RPCs are callable by
    `authenticated` and by nothing else; the three guards and
    `teacher_homework_code_available()` are callable by **nobody**.

    #### Post-apply evidence, on the live functions (43 checks, all aborting)

    | | |
    |---|---|
    | **rotation exit** | old code reserved, row carries the new one, the new one NOT reserved, provenance row correct (homework, workspace, actor, timestamp) |
    | **draft-deletion exit** | code reserved, row gone, `code_available` false |
    | raw INSERT · rotated-away code | refused `22000` — *code … was retired and can never be issued again* |
    | raw INSERT · deleted-draft code | refused `22000` |
    | **raw UPDATE · rotated-away code** | refused `22000` |
    | raw UPDATE · deleted-draft code, **on a different row** | refused `22000` — it is the code, not the row that retired it |
    | raw UPDATE · fresh code | accepted, row carries it |
    | raw UPDATE · a code a live row holds | refused **`23505`** — the UNIQUE, untouched |
    | raw UPDATE · its own current value | accepted |
    | raw INSERT · fresh code | accepted — the guard blocks nothing ordinary |
    | title / `due_at` / publish / reveal, **with the row's own live code planted in the reservation** | all accepted — the guard did not fire |
    | the same row, naming `homework_code` with that planted value | refused `22000` — so the four above measure the *scope*, not a sleeping guard |
    | raw code UPDATE on a CLOSED paper | refused `42501` — H2's guard still fires on the code column |
    | reservation row · UPDATE / DELETE | refused `22000` / `42501` |
    | **14 wrong codes** | 10 accepted, then `53400` at attempt 11, with **10 attempt rows recorded** |
    | 5 rows planted 3 h old, then one call | table holds 1 — the in-RPC prune is the only sweep this database can run |
    | member attaches, code lowercase with spaces | `{ok:true, reason:attached}` |
    | the same code again | `already_attached`, 1 access row |
    | `can_open` · `student_my_homework` | true; 1 row, `can_open` true in the list |
    | outsider (real code · retired code · garbage) · pending assistant | `no_match` for all four |
    | teacher · ACTIVE assistant | `staff` |
    | membership removed by the owner | `can_open` false, attachment kept, re-attach `no_match` |
    | student rejoins | `can_open` true again |
    | class deactivated | `can_open` false, attach `no_match` |
    | paper closed | `can_open` false, attach `no_match` |
    | staff roster · teacher vs ACTIVE assistant | 1 row each — parity |
    | staff roster · outsider · pending assistant | `42501` |
    | attach · `student_my_homework` with no session | `42501` |
    | **audit** | exactly **1** `homework_attached` row for 1 attach + 1 re-entry + 9 refusals; actor and `subject_id` both the student, workspace correct, `meta` = `{homework_id}`, timestamp from the column default |
    | audit totals for the run | 3 `homework_created`, 1 `homework_code_rotated`, 1 `homework_attached` — update, delete and content edits still log nothing |
    | H5 tables | `teacher_homework_attempts` 0, `teacher_homework_responses` 0 |
    | analyzer | 893 / 11 / 24, unmoved |

    **Access scope, driven as the real database roles** (`set local role`): the
    two internal tables refuse `authenticated` SELECT *and* INSERT (`42501`),
    `teacher_homework` refuses a client INSERT, `teacher_homework_code_available()`
    and the code guard both refuse `authenticated` with *permission denied for
    function*, `anon` cannot call attach and cannot read the reservation, the
    four client RPCs are 4/4 for `authenticated` and **0/4** for `anon`, and
    `anon` holds EXECUTE on **0** homework functions.

    **Nothing survived.** After the probes: all **eight** homework tables at
    **0 rows**, the audit log back at **2** rows with **0** homework labels
    used, analyzer 893/11/24.

    **New production baseline** (2026-09-03, post-H4):

    | | |
    |---|---|
    | migrations | **190**, newest `20260903203209` |
    | public | 84 tables · 209 functions · 138 policies · 22 enum labels |
    | homework | 8 tables · 28 functions · 9 policies · 2 triggers on `teacher_homework` |
    | hashes | constraints `26715f0c…` · policies `1480dd9e…` · relations `01e30b21…` · triggers `59ba9b5a…` · grants `9642f485…` · homework bodies `189231ec…` · homework signatures `9ffa38a1…` |

    The policy hash is **byte-identical** to the value measured before the apply
    during the rollback rehearsal — "H4 adds no policy" is a measurement, not a
    claim. `20260904z` stays PREPARED and unapplied, and its window is open: 0
    reservations and 0 attachments exist right now.

    **H5 has not started.** There is still no way for a student to open, save or
    submit a homework — only to be attached to one.

    #### The rollback window — written before the apply, not after

    `20260904z` refuses while **any** code is reserved, so **the first code
    rotation OR the first draft deletion closes it completely**: releasing
    reserved codes would be worse than never having fixed the hazard, because a
    teacher who rotated a leaked code was told the old one was dead. Deleting a
    draft is the ordinary authoring action of the two, so in practice this
    window closes early and by accident rather than by decision — that is what
    the widened invariant costs, and it is written in the file's header rather
    than discovered afterwards. The **first student attachment** closes the
    *H2* rollback rather than this one — `20260902y` already refuses while
    attachments exist — and this file deletes no attachment. The limiter table
    is always safe to drop; its rows are one-hour counters.

    #### Verification

    **352** checks in `tests/teacher-homework.test.mjs`, **109** in
    `teacher-access-scope`, CI **66/66**, **75 of 75 mutants killed with none
    unapplied**. One of those mutants exists only because the shared
    access-scope suite's definer/`search_path` check matched `as $$` alone and
    so had been **silently skipping every teacher_exam and teacher_homework
    migration** — all of them use `$fn$`. Widened to any dollar-quote tag, it
    passes, so nothing was hiding behind it.

    (The earlier draft of this section closed with *"production is unchanged —
    189 migrations, no H4 object present"*. That was true while H4 was PREPARED
    and is not true now. The post-apply state is the section above; this note
    stays so the reversal is visible rather than silently overwritten.)

    #### H4 CLOSEOUT — accepted 2026-09-03

    | | |
    |---|---|
    | migration | `20260903203209` (`20260904a`) |
    | commit | `788927c` on `claude/teacher-intelligence-layer-8e66b0` |
    | migrations applied | **190** |
    | CI | 66/66 |
    | contract suite | 352/352 |
    | access-scope suite | 109/109 |
    | mutation suite | 75/75 killed |
    | installed bodies | all **11** byte-identical to the prepared file |
    | analyzer | 893 / 11 / 24, unchanged |
    | homework data · audit | all eight tables 0 rows; audit log back at 2 rows, 0 homework labels |
    | baseline hashes | constraints `26715f0c…` · policies `1480dd9e…` · relations `01e30b21…` · triggers `59ba9b5a…` · grants `9642f485…` · homework bodies `189231ec…` · homework signatures `9ffa38a1…` |

    **`20260904z` is the active rollback artifact for H4**, PREPARED and
    unapplied.

    > **⚠️ ITS ROLLBACK WINDOW IS CURRENTLY OPEN.** Re-measured at closeout:
    > `teacher_homework_retired_codes` = **0 rows**, `teacher_homework_access` =
    > **0 rows**, `teacher_homework_attach_attempts` = **0 rows**. The window
    > closes at the **first code rotation or the first draft deletion** — and a
    > draft deletion is the ordinary authoring action of the two, so it will
    > close early and by accident rather than by decision. Anyone who wants H4
    > reversible should decide that *before* a teacher touches the system, not
    > after.

    **H5 has not started.** The next stage is an H5 audit, read-only, on the
    live schema: the whole access / read / start / resume / submission
    lifecycle understood first, with no SQL, no migration and no UI.

    #### Verification

    262 checks in `tests/teacher-homework.test.mjs`, 109 in
    `teacher-access-scope`, CI 66/66 green, and **73 of 73 mutants killed with
    none unapplied**. Three of those mutants exist because earlier passes let
    something through: `M60` (a `create or replace function` smuggled into the
    label migration, which the old scope regex could not see, since "or replace"
    sits between the verb and the object), `M72` (the delete telling a closed
    paper to close itself) and `M73` (dropping the student-row pre-check).

    **Production is unchanged.** 187 migrations, newest still
    `20260903123458`; nothing newer applied; 6 homework tables, 9 policies and
    **7** functions — H2's five guards, its stimulus trigger and
    `teacher_homework_is_staff` (md5 `63ef7fa2…`), with **0** H3 RPCs present;
    all six homework tables at 0 rows; 21 enum labels with
    `homework_answers_revealed` **absent**; the audit log still 2 rows;
    analyzer 893/11/24; 186 functions / 133 public policies / 82 tables. (A
    schema-blind `count(*) from pg_policy` reads 138 — 133 in `public` plus 5 in
    `storage`. The recorded baseline is the public count.)

---

## 16. Provenance

- **2026-09-01 — §15.12 revoked the same day it was written, and replaced by
  §15.14.** Class membership alone was made insufficient for Teacher Exam access
  on the observation that a Class Code spreads: every exam now carries its own
  code, and that code raises an approval request rather than granting entry.
  Design only; nothing implemented.
- **2026-09-01 — Two architecture decisions recorded (§15.12, §15.13),** taken
  with Increment A of the Teacher Assignment system: Teacher Exams are gated by
  class membership rather than a second code, and teacher-authored exam results
  stay out of the learning-signal pipeline until taxonomy and difficulty mapping
  are designed and approved. Increment A itself ships the Exams page category
  structure only — no schema, no backend, no Teacher Exam content.
- **2026-08-30 — Direction adopted.** Recorded from the founder's product
  direction (two messages: *"Teacher Intelligence Layer — Why Teachers Would
  Bring Their Students to SI Math AI"* and the follow-up
  *"Teacher Intelligence Should Go Beyond a Dashboard"*), together with the
  explicit instruction that this is **direction and architecture philosophy only,
  with no implementation**, and that the Mock experience and its evidence
  foundation come first.
- The founder's framing is preserved verbatim in §4 where it is the clearest
  statement of intent. §5 (measured), §6 (the four gates), §7, §8, §10 and §15
  are this document's own engineering contribution: what the platform can
  actually compute today, what would make each idea honest, and what must be
  decided before any of it is built.
- **2026-08-30 (second session) — three decisions.** A class-level convergence
  surface was proposed on the argument that aggregation is a different evidence
  problem from trajectory. It was **refused**: the argument and the three
  counter-arguments are recorded as §15 open question 11, together with the
  threshold pre-registered under §6.2 so that a later session cannot choose it
  after seeing which cut produces an interesting screen. **T1.6** — the
  intervention record — was approved instead, on the §4.7 grounds that a marker
  recorded after the outcome it precedes is worthless, so the log has to start
  early or never. And the T1 surface's scope note was found **stale**: it still
  told teachers that weaknesses were not there while the learning slot was
  rendering them, which is a page describing itself wrongly to the person who
  has to defend it.
- **2026-09-02 — Teacher Homework H2 prepared, and not applied.** Five tables,
  their constraints, their guards and their RLS, written after reading the live
  3b conventions rather than recalling them. Both forward files were run
  verbatim against production inside an aborting transaction with 49
  behavioural probes (0 failures, assistant parity driven end to end through the
  real staff RPCs, every client write refused, the analyzer unmoved), and the
  rollback was rehearsed the same way — it refused while an attachment existed,
  and returned every schema hash to its pre-H2 value. Production is unchanged:
  184 applied, newest `20260902001047`. 34 of 34 mutants killed; the one that
  survived first exposed a prefix-matching grant check, now fixed in two
  suites. The per-item answer record H5 needs was kept out because the approved
  scope named five tables, and it is flagged as its own increment.
- **2026-09-03 — H3 PREPARED.** The authoring RPCs, designed after reading every
  3c exam RPC out of production rather than out of the repo (§15.16). Thirteen
  client RPCs, two helpers, four audit labels, no student surface. `due_at` and
  `reveal_answers` each got their own RPC because their lifecycles differ from
  the paper's, and the latch takes no boolean so that un-revealing is not
  expressible. 44 of 44 mutants die, 30 dry-run probes and 8 rehearsal checks
  come back clean on production, and nothing is applied. Raised for decision:
  revealing the answers is irreversible and has no audit label.
- **2026-09-03 — H2 APPLIED.** The package went live as `20260903123333` /
  `20260903123410` / `20260903123458`, taking production from 184 to 187
  migrations. Verification ran before anything else (§15.15d): the seven
  function bodies byte-identical to the repo files, 21 behavioural checks on the
  live schema with no failures, the analyzer and the audit log unmoved, and all
  six tables at zero rows because no write path exists until H3. `20260902y`
  stays prepared. The homework backend now has a complete schema and nothing
  that can write to it.
- **2026-09-03 — the three H2 decisions taken, and the package closed.** The
  owner chose composite foreign keys over a guard ("a foreign key is not an
  opinion"), the one-way `reveal_answers` latch including the closed-status
  exception, and one atomic `b + c + d` package with a matching rollback. The
  files now carry all three; 33 of 33 mutants die, the verbatim dry-run and the
  rollback rehearsal both come back clean on production, and nothing is applied.
  The retired-code hazard was explicitly left to H4 rather than allowed to widen
  H2.
- **2026-09-02 — Teacher Homework H2 prepared, then HELD at the owner's
  decision.** The preparation was accepted as clean and the apply refused until
  two gaps close: the per-item answer record H5 cannot work without, and the
  lifecycle of the three fields that stay mutable after publish. Both were then
  audited against the live schema and measured on production in aborting
  transactions (§15.15a, §15.15b). The measurement found that a **closed**
  homework can never reveal its answers, which defeats the ordinary marking
  flow and the migration's own stated rationale for the field — the one
  proposed change to H2 SQL, written nowhere yet and awaiting approval. Two
  further findings were recorded and not acted on: a retired homework code can
  be claimed by a new homework, and the exam system's own RLS already hands a
  student the per-item breakdown `teacher_exam_submit()` says it withholds.
- **2026-09-02 — Teacher Homework: six decisions locked, H1 prepared.** The
  read-only audit (§15.15) established that nothing homework-shaped exists,
  what the exam system lends by call and what it lends only as a template, and
  that `exam.html` is reachable only by URL. The owner locked feedback,
  analyzer boundary, late submissions, closing, parity and the entry point, and
  approved H1 only — five irreversible audit labels, prepared, then applied the
  same night as `20260902001047` on its own approval and verified. H2 not
  started.
- **2026-09-01 — the class-level claim, admitted with two decisions.** A
  read-only audit (recorded under §15.11) established that the aggregate needs
  no new data and no new access, and that the pre-registered cut, applied with
  `teacher_attention()`'s 14-day freshness, is silent on today's production
  even platform-wide. The owner locked freshness (inherited) and identity
  (stored id; the resolver excluded from counting) before implementation. The
  same audit found that no existing read carries the stored id to a teacher, so
  the UI-only scope cannot honour the identity decision on its own; the
  delivery path is an owner decision listed under §15.11 — chosen the same
  day: widen the read (path A), prepared as `20260901h`/`20260901t`, and
  `20260901h` applied that evening as `20260901220926` after its own approval,
  and the card built the same night against it — in the repository, not
  deployed.

### 15.18 · Teacher Homework H5 — THE AUDIT (read-only, 2026-09-03)

**Status: AUDIT ONLY.** No SQL was changed, no migration written, no function
created or modified, no policy, RLS or grant touched, no UI. Every behavioural
probe ran inside a transaction that ended in `raise exception`, so nothing
persisted. Baseline: H4 LIVE at `20260903203209`, commit `788927c`, 190
migrations.

The point of this stage is to learn the lifecycle from the live schema rather
than assume Homework must behave like Teacher Exams. Where the exam system is
cited below it is as a *measured comparison*, never as a template.

---

#### 1 · Live architecture inventory

**Eight tables**, all with RLS enabled (none FORCEd), all at **0 rows**.

| table | shape | client grant | policies |
|---|---|---|---|
| `teacher_homework` | 13 cols; `status` draft/published/closed; `reveal_answers`; `due_at` | `authenticated: SELECT` | **staff read only** |
| `teacher_homework_stimuli` | 11 cols; six kinds; SVG media with sha | `authenticated: SELECT` | staff read only |
| `teacher_homework_questions` | 11 cols; **`correct_answer` NOT NULL**, `explanation` | `authenticated: SELECT` | staff read only |
| `teacher_homework_access` | `(homework_id, student_id)` PK, `attached_at` | `authenticated: SELECT` | own read · staff read |
| `teacher_homework_attempts` | `status` in_progress/submitted, `started_at`, `submitted_at`, `late` | `authenticated: SELECT` | own read · staff read |
| `teacher_homework_responses` | `answer`, **`is_correct` nullable**, `ordinal`, `last_answered_at` | `authenticated: SELECT` | own read · staff read |
| `teacher_homework_retired_codes` | H4 reservation | **none** | **none** |
| `teacher_homework_attach_attempts` | H4 limiter | **none** | **none** |

`anon` holds nothing anywhere — 0 table grants and EXECUTE on 0 of the 30
homework functions. `service_role` holds full DML on all eight, as it does on
every table in this database.

**Nine triggers.** `teacher_homework` carries two (H4's
`BEFORE INSERT OR UPDATE OF homework_code`, H2's `BEFORE DELETE OR UPDATE`);
questions and stimuli carry the content guard and the same-homework check;
access, attempts, responses, retired codes and attach attempts each carry an
append-only guard. **Every one of them is `BEFORE DELETE OR UPDATE` or
narrower — not one covers INSERT on the student tables.** See H-1.

**Thirty functions** (28 `teacher_homework*` + `student_attach_homework` +
`student_my_homework`). All `SECURITY DEFINER` except
`teacher_homework_new_code` and `teacher_homework_shift_ordinals`, which are
callable by nobody; all thirty pin `search_path = pg_catalog, public`.
**18 callable by `authenticated`, 12 by nobody, 0 by `anon`.**

**No client surface exists.** There is no homework page in the repository, and
`teacher.html`, `teacher-exams.html` and `exam.html` do not reference homework.

---

#### 2 · Student access and read lifecycle — what exists, and what does not

Measured as a real `authenticated` session for a student **attached to a
published paper**:

| read | rows returned |
|---|---|
| `teacher_homework` | **0** |
| `teacher_homework_questions` | **0** |
| `teacher_homework_stimuli` | **0** |
| `teacher_homework_access` | **1** — their own |
| `teacher_homework_attempts` (2 exist, one per student) | **1** — their own |
| `teacher_homework_responses` (4 exist) | **2** — their own attempt's |

So the answer key, the explanations, the prompts, the figures, and the paper
row itself are **all unreachable to a student today**, and the only student
read that exists is `student_my_homework()` — a definer RPC returning title,
class name, status, due date, `reveal_answers`, attachment time, attempt
status, submitted time, `late`, and `can_open`. It returns no item content.

**There is therefore no way for a student to read a question.** H5 must add
that read, and it must come from a definer RPC with a **named column list**
that never selects `correct_answer` or `explanation` — the shape
`teacher_exam_start()` already uses, where the key "is not filtered out
downstream; it is never selected in the first place".

---

#### 3 · Start lifecycle — the one decision that shapes everything

There is no start RPC. The gate that exists is `teacher_homework_can_open(uuid)`,
which takes **no student parameter** and re-reads five live conditions:

```
attached  AND  membership active (and not expired)  AND  workspace active
          AND  homework.status = 'published'
```

No `due_at` condition — decision 3 makes the due date a date, never a lock.

**Measured, and this is the finding that must be settled first (D-1):**

| state | `can_open` |
|---|---|
| published, attached, active member | **true** |
| **the teacher closes the paper while a sitting is in progress** | **false** |

Meanwhile the responses guard consults the **attempt** status and never the
paper's, so with the paper closed and the attempt still `in_progress`, writing
an answer was **accepted**. Today those two rules disagree, harmlessly, because
no start path exists. The moment H5 exists they cannot both stand.

The exam system resolved the same question by **looking up the sitting before
asking the gate at all** — `teacher_exam_start()` resumes first and calls
`teacher_exam_can_start()` only when no attempt is found, so "a student removed
from the class since starting still reaches it". Homework can adopt that, or
decide the opposite. It is a rule inside H5's start RPC either way: **no schema
change is required for either answer.**

---

#### 4 · Resume lifecycle

An in-progress attempt is `status = 'in_progress'`; there is no `abandoned`
state (the CHECK admits two values only). `teacher_homework_attempts_own_read`
is `user_id = auth.uid()` with **no membership condition**, so a student keeps
reading their own attempt after removal from the class — consistent with the
attachment being permanent, and with H4's measured behaviour.

- **Another student's attempt** — unreachable (measured: 1 of 2 rows).
- **Duplicate attempts** — impossible: `UNIQUE (homework_id, user_id)` refused
  a second attempt with `23505`. This is stronger than the exam system's
  `client_request_id`, and it means H5's start must **catch `unique_violation`
  and re-select**, or two browser tabs produce an error instead of a resume (D-8).
- **Rejoin** — `can_open` returns true again (measured during H4 post-apply).

---

#### 5 · Answer / write lifecycle

No save RPC exists. What the schema already enforces, measured:

| write | result |
|---|---|
| `authenticated` INSERT into `teacher_homework_attempts` | **`42501`** |
| `authenticated` INSERT into `teacher_homework_responses` | **`42501`** |
| answer change while the attempt is `in_progress` | accepted |
| answer change after submission | **`42501`** |
| a response naming **another paper's** question | **`23503`** — the composite foreign keys, not a trigger |
| deleting an attempt or a response | **`42501`** |
| `is_correct` on an **unanswered** item | **`23514`** — the omission CHECK; omission stays three-valued |

The same-homework rule is two composite foreign keys onto `UNIQUE (id,
homework_id)` keys, so it is a constraint a later migration cannot quietly drop.

---

#### 6 · Submission and grading

**The latch is real and was measured**, on the live tables:

| | |
|---|---|
| un-submitting (`submitted → in_progress`) | **refused `22000`** |
| *any* update to a submitted attempt, including `late` | **refused `22000`** |
| changing an answer after submission | **refused `42501`** |
| re-grading an item that already carries a verdict | **refused `42501`** |

The canonical grading rule exists and is
`exam_answer_matches(format, correct, given)`: an empty answer is never
correct, `mcq` is trimmed-uppercase equality, `grid_in` tries numeric equality
and falls back to whitespace-stripped string equality. **H5 must call it, not
restate it** — the assertion 3e already carries.

Two measured gaps that are not defects today but decide H5's shape:

- **G-2 · grade-before-submit is documented, not enforced.** The responses
  guard's own comment says *"H5 must therefore grade BEFORE it flips the
  attempt to submitted"*. It gates only `answer` on attempt status, so an
  **answered but ungraded** item was successfully graded **after** submission.
  Convention, not constraint (D-4).
- **G-4 · `last_answered_at` is unguarded** and moved on a submitted response.
  It is the only column on a submitted answer that can still change (H-2).

**And the one that changes a product decision (D-2).** A student reads their own
`is_correct` through `teacher_homework_responses_own_read`, whose predicate is
attempt ownership and **nothing else** — no reference to `reveal_answers`, none
to attempt status. Measured: with `reveal_answers = false`, the student read
both per-item verdicts the instant they were written. So as the schema stands,
`reveal_answers` gates the *key and the explanation* (already unreachable) and
**not** the right/wrong verdicts. If that is the intent, say so and grade only
at submit. If it is not, the H2 policy must be narrowed — and that is cheap only
while every table holds 0 rows.

---

#### 7 · Teacher / assistant visibility

`teacher_homework_is_staff(homework)` → `workspace_is_active_staff(workspace)`,
which requires `status = 'active'` **and** `w.is_active`. It is **role-blind**:
teacher and active assistant are identical, a pending assistant is not staff,
and a deactivated workspace removes staff powers from everyone. Measured in the
H4 post-apply run: identical rosters for teacher and active assistant; `42501`
for a pending assistant and an outsider.

**Staff already read submitted answers and the answer key directly**, through
the H2 policies — measured: a teacher selected 2 response rows and 2 question
rows with no RPC involved. So H5 may need no new staff read at all; a shaped
RPC would be a presentation choice, not a security one (D-7).

`teacher_homework_students(homework)` returns the roster with attempt status,
submitted time and `late` — but no per-item detail.

---

#### 8 · Membership and workspace predicates, as they are actually written

| predicate | live definition |
|---|---|
| active membership | `ws.status = 'active' AND (ws.expires_at IS NULL OR ws.expires_at > now())` |
| active staff | `s.status = 'active' AND w.is_active` |
| student gate | `attached AND active membership AND w.is_active AND h.status = 'published'` |

Every one is read **live**, per call. Nothing is cached and no row is stamped,
so revoking a class link closes the door with no cleanup job. The one stale
artefact by design is the attachment itself, which is append-only and never
deleted — it records that a code was once redeemed, and grants nothing on its
own.

---

#### 9 · State and transition matrix

**Homework** — `draft → published → closed`, one way, enforced by
`teacher_homework_guard` plus the two stamp CHECKs.

| transition | actor | function | authorization | database enforcement | result |
|---|---|---|---|---|---|
| create → draft | staff | `teacher_homework_create` | `workspace_is_active_staff` | code guard + UNIQUE | row + audit |
| draft → published | staff | `teacher_homework_publish` | `is_staff`, `FOR UPDATE` | guard sets `published_at` | audit |
| published → closed | staff | `teacher_homework_close` | `is_staff`, `FOR UPDATE` | guard sets `closed_at` | audit |
| closed → anything | — | — | — | guard `42501` | refused |
| edit paper after publish | — | `teacher_homework_update` refuses | `<> draft` → `42501` | content guard | refused |
| `due_at` change | staff | `teacher_homework_set_due_at` | refused only when **closed** | — | **allowed on a published paper** (D-5) |
| reveal answers | staff | `teacher_homework_reveal_answers` | `is_staff` | one-way latch, allowed even when closed | audit, once |
| delete | staff | `teacher_homework_delete` | draft only, no student rows | code retired first | row gone |

**Attempt** — `in_progress → submitted`, one way.

| transition | enforcement | measured |
|---|---|---|
| create in_progress | UNIQUE(homework, user) | second start `23505` |
| **create born-submitted** | *nothing* | **accepted** — see H-1 |
| in_progress → submitted | CHECKs tie `submitted_at`/`late` | as designed |
| submitted → in_progress | attempts guard | `22000` |
| any edit of a submitted attempt | attempts guard | `22000` |
| delete | attempts guard | `42501` |

---

#### 10 · Audit and provenance

Six homework labels exist, at enum positions 17–22: `homework_created`,
`homework_published`, `homework_closed`, `homework_code_rotated`,
`homework_attached`, `homework_answers_revealed`. All six are written, each
once, with the actor bound to `auth.uid()` and `meta` carrying the homework id.

**No label exists for start, save or submit** — measured, not assumed. Whether
any of those deserve one is D-6, and it matters *now* rather than later: adding
an enum label is its own migration because a new label cannot be cast until the
transaction that adds it commits (measured twice on this database). Deciding
after H5's RPC file is written means splitting it.

Still unaudited from earlier increments, unchanged and out of scope here:
update, `set_due_at`, delete, question and stimulus edits, reorder.

---

#### 11 · Analyzer boundary — proof

Measured over **every function in `public`**, comments stripped:

| probe | result |
|---|---|
| functions naming both a homework table and an analyzer table | **NONE** |
| functions that write an analyzer table and mention homework | **NONE** |
| functions that write `weakness_signals` | **NONE — in the whole database** |
| functions that write `exam_mistakes` | `exam_submit` only |
| functions that write `exam_practice_sessions` | `exam_submit` only |
| triggers on any analyzer table | **NONE** |
| tables written by homework functions | homework tables + `workspace_audit_log`, nothing else |

And behaviourally: a paper authored, published, attached, answered, graded and
submitted through the live functions moved the analyzer by **zero** —
`893 / 11 / 24` before and after.

**The honest limit of that proof.** `weakness_signals` is written by *no*
database function; the analyzer is written from the browser. So the boundary
that will matter for H5 is a **client-side** one, exactly as 3g's is: `exam.html`
returns from `finish()` before `ExamMistakesLogger.process`,
`regenerateWeaknessReports` and `updateStreak`, and `teacher_exam_submit()`
"returns no session_id and no mistakes array precisely so this path cannot be
taken by accident — the guard below is the second lock, not the only one."
H5 must reproduce **both** locks, and the player's guard must be *measured*
(headless call counts), not asserted.

---

#### 12 · Abuse, race and direct-call findings

| attack | outcome |
|---|---|
| direct table write as `authenticated` (attempt or response) | `42501` — SELECT is the only grant |
| duplicate start (two tabs) | `23505` — H5 must catch and re-select (D-8) |
| concurrent submit | second flip hits the attempts guard `22000`; H5 should still `SELECT … FOR UPDATE`, as publish and close already do |
| answering another student's attempt | unreachable — no write grant, and RLS scopes reads |
| answering another paper's question | `23503`, by composite FK |
| stale membership | every gate re-reads live; the attachment grants nothing alone |
| rejoin | `can_open` true again, no new attachment needed |
| direct RPC call bypassing a UI | every RPC re-checks authorization itself; the UI decides nothing |
| **raw INSERT of a born-submitted attempt** | **accepted** (H-1) |
| **raw INSERT of a response marked correct with a wrong answer** | **accepted** (H-1) |

---

#### 13 · Findings, classified

**Confirmed correct** (measured, no action): client grants are SELECT-only and
`anon` holds nothing; the answer key is unreachable to students; reads are
scoped to the caller; submission is a one-way latch and a submitted attempt is
frozen entirely; attempts and responses are never deleted; duplicate sittings
are impossible; cross-homework answers are impossible by constraint; omission is
three-valued; staff parity is role-blind and live; the analyzer boundary holds
at the database layer.

**Defects: none.** Everything H2, H3 and H4 promised behaves as recorded.

**Design decisions required before any H5 line is written**

| # | decision | smallest scope |
|---|---|---|
| **D-1** | Does closing a paper end a sitting already in progress? `can_open` says yes, the responses guard says no. | A rule inside H5's start RPC. **No schema change for either answer.** |
| **D-2** | What does `reveal_answers` gate? Today a student can read their own verdicts with it `false`. | (a) document it as key-only, or (b) narrow `teacher_homework_responses_own_read`. **(b) is cheap only while the tables hold 0 rows.** |
| **D-3** | Grade at submit only, or on save? On save + D-2(a) makes the paper an oracle. | H5's save RPC writes `answer` and never `is_correct`. |
| **D-4** | Rely on convention for grade-before-submit, or enforce it? | Convention: order the statements. Enforcement: extend the responses guard. |
| **D-5** | Is `late` frozen at submit, given `set_due_at` still works on a published paper? | Compute once in the submit RPC and state it. |
| **D-6** | Which of start / save / submit deserve an audit label? | Decide now — a new label is its own migration, always. |
| **D-7** | Does staff answer review need a shaped RPC, given the H2 policies already serve it? | Presentation choice; no new policy either way. |
| **D-8** | How does start behave for a second tab? | Catch `unique_violation`, re-select, return the same attempt. |

**Hardening opportunities** (not required for H5 to be correct; named so the
choice is deliberate)

| # | opportunity | why |
|---|---|---|
| **H-1** | No INSERT guard on `teacher_homework_attempts` or `teacher_homework_responses`. A born-submitted attempt and a mis-graded response were both accepted as the table owner. | Unreachable for clients today because they hold no INSERT — **the exact shape of the H4 code-guard finding**: an invariant that holds only because nobody currently has a grant. |
| **H-2** | `last_answered_at` can move after submission. | The only mutable column on a frozen answer. |
| **H-3** | The answer key sits in a table where `authenticated` holds a table-wide SELECT grant; only RLS separates it. `teacher_exam_questions` has the identical posture, so this is a shared pattern rather than a homework defect. | A column-level grant or a separate key table would make the separation structural rather than policy-dependent. |

**What H5 must add** (scope, not design): a definer read of the paper and its
items with a named column list excluding the key; start/resume; save; submit
with grading through `exam_answer_matches`; and a student player carrying the
3g analyzer guard. Nothing in the current schema blocks any of it — the six
tables, the constraints and the guards are already shaped for it, which is what
H2 was for.

**H5 remains AUDIT ONLY. No implementation was prepared.**

### 15.19 · H5 decisions D-1 and D-2 — LOCKED, and their measured consequences

**Still AUDIT ONLY.** Nothing was changed: no migration, no SQL, no function,
no policy, no UI. The probes below ran in a transaction that ended in
`raise exception`. All eight homework tables held **0 rows** before and after.

#### The two decisions, as locked

> **D-1.** Closing prevents new starts and opens, but an attempt already
> `in_progress` may be resumed, answered and submitted. Closing must not mutate
> or terminate the attempt. Membership and workspace authorization stay
> live-rechecked. No new sitting after close. Racing starts resolve to the
> existing attempt.

> **D-2.** `reveal_answers` controls exposure of the **correct answer and the
> teacher's explanation**. It does not hide the student's own per-item
> correctness once that item has been graded. The flag stays one-way.

---

#### 1 · What must change — D-1

**No constraint and no trigger conflicts with D-1. The database already does
exactly what it asks**, measured on the live schema:

| probe | result |
|---|---|
| close a paper with a sitting in progress | attempt still `in_progress`, `submitted_at` NULL, both responses intact — **closing mutates nothing** |
| save an answer into that attempt after close | **accepted** — the responses guard consults the ATTEMPT status, never the paper's |
| grade and submit that attempt after close | **accepted** — the attempts guard requires only `old.status = 'in_progress'` |

So D-1 needs **no schema change at all**. What it needs is a function change,
and the audit narrows it to one place:

**`student_my_homework()` is the problem, not `can_open()`.** Measured: with a
sitting in progress, the list's `can_open` column read **true** while published
and **false** the moment the paper closed. Under D-1 that student may still
finish — but their own list tells them they may not, so the tile would grey out
a paper that is still open to them.

`teacher_homework_can_open(uuid)` itself is **already the new-start gate D-1
wants**: attached · active membership · active workspace · `status='published'`.
Its predicate is correct; only its *name* now describes something narrower than
callers assume.

Two shapes, and they are not equal in blast radius:

| option | live functions redefined | note |
|---|---|---|
| **(a) leave `can_open` untouched** as the new-start gate; add a resume-aware read for the list | **1** (`student_my_homework`), plus one new helper | one function, one meaning; H5's start RPC resumes first and calls `can_open` only when no attempt exists |
| (b) widen `can_open` to `published OR an in-progress attempt exists` | **2** (`can_open` and, in effect, every future caller's expectation) | changes what a LIVE H4 function means for callers that have not been written yet |

Option (a) is strictly smaller and is the one this audit would put forward. The
helper it implies is a `can_resume`-shaped predicate — attached · active
membership · active workspace · an `in_progress` attempt exists — so the list
column becomes *may start* **or** *may resume*. `student_my_homework()` already
LEFT JOINs the attempt, so it has the status in hand.

**A consequence D-1 creates that is not yet decided.** D-1 keeps membership
live-rechecked on resume. Measured: after removal from the class, `can_open`
went false — and an attempt **can never be deleted** (`42501`, the attempts
guard). So a student removed mid-sitting owns an `in_progress` attempt that can
never be submitted and never be cleared, and it sits on the teacher's roster as
"in progress" permanently. Teacher Exams avoided this by making resume bypass
authorization entirely ("a student removed from the class since starting still
reaches it"). D-1 deliberately diverges, so this state is reachable and needs a
rule: accept and label it on the roster, allow a removed student to submit but
not to keep answering, or treat removal as terminal. **Not chosen here.**

**Racing starts.** `UNIQUE (homework_id, user_id)` refuses a second attempt with
`23505` (measured), so H5's start must catch `unique_violation` and re-select
rather than surface an error. Separately, nothing in the database gates an
attempt INSERT on the paper's status, so a start can still land microseconds
after a close; `SELECT … FOR UPDATE` on the homework row inside the start RPC
closes that window, exactly as `publish` and `close` already do.

#### 2 · What must change — D-2

**No policy changes. None.** `teacher_homework_responses_own_read` is attempt
ownership and nothing else, which is precisely what D-2 locks — measured: the
student read their own verdict with `reveal_answers = false`. **The window that
made D-2 urgent is therefore closed by the decision itself**: there is no policy
to narrow, so nothing about it depends on the tables staying empty.

What D-2 *does* require is a read that does not exist. Measured: a student reads
**0 rows** from `teacher_homework_questions`, so `reveal_answers = true` has no
path to the key or the explanation today. Two shapes:

- a new RLS policy on `teacher_homework_questions` — it would have to join
  attempts and the reveal flag, and the grant on that table is column-blind, so
  the policy would be the only thing standing between a student and
  `correct_answer`;
- **a definer RPC with a named column list** — the shape every other
  student-facing read in this system already uses, and the one
  `teacher_exam_start()` describes as "never selected in the first place".

The RPC is the smaller and safer of the two.

#### 3 · Existing data affected

**None.** All eight homework tables held 0 rows at the moment of the audit and
hold 0 rows now. Neither decision has anything to migrate.

#### 4 · Exactly what a student may see, under each state

Assuming D-3 locks grading at submit (see §5 below), the surface is:

| field | source | reveal=false · in progress | reveal=false · submitted | reveal=true · in progress | reveal=true · submitted |
|---|---|---|---|---|---|
| title · instructions · status · `due_at` · the reveal flag itself | homework | ✓ | ✓ | ✓ | ✓ |
| prompt · format · choices · stimulus · ordinal | questions / stimuli | ✓ | ✓ | ✓ | ✓ |
| own `answer` | responses | ✓ | ✓ | ✓ | ✓ |
| own `is_correct` | responses | — *(NULL until submit)* | **✓** | — *(NULL until submit)* | **✓** |
| `correct_answer` | questions | ✗ | ✗ | **✗** | **✓** |
| `explanation` | questions | ✗ | ✗ | **✗** | **✓** |
| any other student's answer, verdict or attempt | — | ✗ | ✗ | ✗ | ✗ |

The two bold ✗ in the `reveal=true · in progress` column are the point of §5.

#### 5 · New security implications

**S-1 · Reveal alone is not a sufficient condition, and D-2 must say so.**
Measured: `teacher_homework_reveal_answers()` was called while the student's
attempt was still `in_progress`, and it succeeded — the function's body does not
mention attempts at all (measured, comments stripped). It is also accepted on a
**closed** paper (measured), which under D-1 can still have a sitting running.
Since answers remain editable while an attempt is `in_progress`, an H5 read
gated **only** on `reveal_answers` would hand the key to a student who has not
submitted, who could then correct their answers. The read must therefore require
`reveal_answers = true` **AND** the caller's own attempt to be `submitted`.
This refines D-2 rather than contradicting it, and it is the one thing in this
report that must be locked before H5's read RPC is written.

**S-2 · D-2 depends on D-3.** `is_correct` is readable by the student the
instant it is written, with no reveal condition and no submission condition. If
H5 ever grades on save, the student gets live right/wrong per answer — the paper
becomes an oracle, and under `reveal=true` an oracle with the key attached.
**D-2 is safe only if grading happens at submit and never on save.** D-3 is no
longer an independent decision; it is a precondition of D-2.

**S-3 · No new exposure is created by either decision.** Both leave `anon` at
zero, leave staff parity untouched, leave the answer key unreachable to
non-staff except through the read S-1 describes, and leave cross-student access
impossible (measured throughout §15.18).

---

**Status: D-1 and D-2 are LOCKED. D-3 is now a precondition of D-2 rather than a
free choice. Two items were surfaced by this audit and are NOT decided:** the
stranded in-progress attempt of a removed student (§1), and the
`submitted`-condition refinement S-1. **No implementation was prepared.**

### 15.20 · H5 decisions D-3 and S-1 — LOCKED, with their measured consequences

**Still AUDIT ONLY.** No migration, no SQL change, no function, no policy, no
UI. Every probe ran in a transaction ending in `raise exception`. All eight
homework tables held 0 rows before and after. **S-2 is deliberately NOT decided
here.**

> **D-3.** Answers are saved without grading; grading happens only at
> submission, by the canonical grading authority. `is_correct` stays NULL until
> submit. After submission the attempt and its responses are immutable. A
> repeated submission is refused. A client must not be able to manufacture
> `is_correct` or a submitted attempt. Homework must never become an answer
> oracle through save-time correctness.

> **S-1.** `reveal_answers = true` is **necessary but not sufficient**: the
> caller must also own a **submitted** attempt for that homework. Closing
> neither grants nor revokes key access.

---

#### 1 · Which existing functions, policies or triggers must change

**For D-3 and S-1: none.** Measured — **no function in the database writes
`teacher_homework_attempts` or `teacher_homework_responses` today**, and only
two functions mention `is_correct` in the homework family at all (the responses
guard, and nothing else). Both decisions therefore constrain code that does not
exist yet; they impose no edit on anything live.

The only pending function change remains the one D-1 already implied —
`student_my_homework()`, whose `can_open` column goes false on close (§15.19).
D-3 and S-1 add nothing to that list.

#### 2 · Can the canonical grading authority be reused safely — yes, measurably

`exam_answer_matches(p_format, p_correct, p_given)` is:

| property | measured |
|---|---|
| volatility | **IMMUTABLE** |
| `SECURITY DEFINER` | **no** (it needs no privilege) |
| `search_path` | pinned |
| `authenticated` EXECUTE | **false** |
| `anon` EXECUTE | **false** |
| current callers | `exam_submit`, `teacher_exam_submit` — and nothing else |

So a `SECURITY DEFINER` H5 submit can call it while **a client cannot call it at
all** — it is not usable as an oracle. It already covers both homework formats,
which are the same two the question CHECK admits.

**One interaction H5 must respect.** The grader returns `false` for an empty or
NULL answer, but `teacher_homework_responses_omission_check` forbids a non-NULL
`is_correct` when `answer IS NULL` — measured `23514`. H5 must therefore not
feed omissions to the grader. The proven shape, taken from `teacher_exam_submit`
and **measured working verbatim against the homework tables**:

```sql
update teacher_homework_responses r
   set is_correct = case when r.answer is null then null
                         else exam_answer_matches(q.question_format, q.correct_answer, r.answer) end
  from teacher_homework_questions q
 where q.id = r.question_id and r.attempt_id = p_attempt;
```

Result: answered item `true`, unanswered item `NULL`. Omission stays three-valued
in code as well as in the constraint.

#### 3 · Exact submit transaction requirements

1. Bind ownership **in the lookup** — `where id = p_attempt and user_id = auth.uid()`.
2. **Take `FOR UPDATE` on the attempt.** This is where "do not copy blindly"
   bites: measured, `teacher_homework_close` **does** lock the paper
   (`for update` = true), while `teacher_exam_submit` **does not** lock the
   attempt (`for update` = false). H5 should take the lock the exam path omits.
3. Grade **before** the flip, in one statement joined to the questions.
4. Flip `status` and `submitted_at` together — the CHECK ties them.
5. Compute `late` in the same statement (**D-5, still open**).
6. Return **counts only**. No per-item breakdown, no `mistakes` array — the
   first of the two analyzer locks.

**Repeat submission needs one line of confirmation, not code.** Measured: a
second submit write is **already refused at the table** with `22000`, whatever
the RPC does. So the question is only what the RPC *says*. `teacher_exam_submit`
treats a repeat as an **idempotent no-op returning the same counts** (measured:
it wraps the work in `if a.status = 'in_progress' then`). D-3 says "refused". A
literal refusal turns a retried request after a network timeout into an error for
a student whose work is already safely submitted. Both satisfy *"the second
submit changes nothing"*; they differ only in what the student sees.

#### 4 · Is response immutability already enforced — almost entirely

Measured against a real graded, submitted sitting:

| write after submission | result |
|---|---|
| change the answer | **refused `42501`** |
| re-grade an item | **refused `42501`** |
| **un-grade — set a verdict back to NULL** | **refused `42501`** — "graded once" forbids *erasing* a verdict, not only changing it |
| turn an omitted item into a verdict | **refused `23514`** — an omission can never become "wrong" |
| a second submit write | **refused `22000`** |
| **move `last_answered_at`** | **ACCEPTED** — the single gap (**H-2**) |

D-3's immutability clause is therefore already true of everything except
`last_answered_at`.

#### 5 · Can graded or submitted state still be manufactured

**By a client: no — D-3's clause is already satisfied.** Measured as a real
`authenticated` session:

| attempt | result |
|---|---|
| UPDATE `is_correct` | `42501` |
| UPDATE the attempt's `status` | `42501` |
| INSERT a born-`submitted` attempt | `42501` |

**By the table owner or `service_role`: yes, unchanged.** Measured: a
born-`submitted` attempt was accepted, and a response marked **correct while
carrying a wrong answer** was accepted. Two further measurements sharpen it:

- a verdict can be written **while the attempt is `in_progress`** — so D-3's
  "NULL until submit" is enforced by **nothing** in the database;
- that verdict read `true` for answer `A` against a key of `B` — **no CHECK can
  reach the key on another table**, so correctness is only ever as good as the
  RPC that writes it.

This is **H-1**, unchanged and still deliberately separate from the lifecycle
decisions.

#### 6 · The student read RPC shape D-1 + D-2 + D-3 + S-1 imply

Definer, `search_path` pinned, granted to `authenticated`, taking
**`p_homework uuid` and no student parameter** — the same reason `can_open`
takes none.

**Gate:** attached · active membership · active workspace · **(published OR the
caller owns an `in_progress` attempt)**.

**Always returned:** title, instructions, status, `due_at`, `reveal_answers`,
the caller's attempt status / started / submitted / late; and per item —
`question_id`, `ordinal`, `prompt`, `question_format`, `choices`, the stimulus
(kind, label, body, spec, media_ref, media_kind), the caller's own `answer`, and
the caller's own `is_correct` (NULL until submit, by D-3).

**Returned only when `reveal_answers = true` AND the caller's attempt is
`submitted`:** `correct_answer`, `explanation`.

One shape question worth settling with the RPC rather than after it: 3e's
principle is that the key is *"never selected in the first place"*, and a
`case when … then q.correct_answer end` still selects the column. Either branch
into two aggregate expressions so the key column is literally absent from the
query that runs when it is not revealed, or accept one conditional query and pin
the output with a test. The first is truer to the principle; the second is
simpler. Not chosen here.

#### 7 · Races

| race | status |
|---|---|
| **save vs submit** | **real.** The responses guard reads the attempt status with a plain `SELECT` — no lock (measured on the live source). Under READ COMMITTED a save whose guard has already run will not see a concurrent flip, and can land an answer change on a just-submitted attempt. **Both save and submit must take `FOR UPDATE` on the attempt.** |
| start vs close | nothing gates an attempt INSERT on the paper's status, so a start can land just after a close; `FOR UPDATE` on the homework row inside start closes it (§15.19) |
| duplicate start | `23505` by UNIQUE — catch and re-select (§15.19) |
| duplicate submit | `22000` at the table, already impossible |
| reveal vs read | harmless **because of S-1**: the read also requires `submitted`, and the flag is one-way, so the worst case is the key appearing one request later |
| reveal vs an in-progress sitting | **this is exactly what S-1 closes.** Without it, the measured scenario in §15.19 (teacher reveals while the attempt is `in_progress`) hands the key to a student who can still edit answers |

#### 8 · Analyzer boundary — re-measured, untouched

No function names both a homework table and an analyzer table (**NONE**); the
only writer of `weakness_signals`, `exam_mistakes` or `exam_practice_sessions` in
the whole database is still `exam_submit`; and after a full authored → answered →
**graded** → submitted sitting the counts stood at **893 / 11 / 24**, the
baseline. D-3 strengthens the boundary rather than testing it: a submit that
returns counts only gives the client nothing analyzer-shaped to forward, which
is the first of the two locks 3g relies on.

---

#### S-2 — OPEN. What an `in_progress` attempt becomes when membership is removed and never restored

**Not decided.** Recorded as a required decision with its option space measured,
so the choice is made against the schema rather than against an assumption:

| option | schema cost, measured |
|---|---|
| **(i) leave it `in_progress` permanently** and let the roster surface say "left the class" | **none** — `teacher_homework_students()` already returns `attempt_status` raw, so this is a surface change, not a database one |
| **(ii) add a terminal status** (`abandoned` / `cancelled`) | `teacher_homework_attempts_status_check` admits **exactly** `in_progress` and `submitted`, so this means altering a CHECK on a live H2 table, plus the attempts guard (which refuses every update once `old.status <> 'in_progress'`), plus every reader. It is not an enum, so there is no `55P04` two-file problem — but it is a schema change to a table H2 froze |
| **(iii) allow a removed student to submit but not to keep answering** | an RPC rule only; no schema change |

Deletion is not an option in any of them: an attempt **can never be deleted**
(`42501`, measured). **No option is chosen here.**

---

**Status: D-1, D-2, D-3 and S-1 are LOCKED.** Two sub-decisions were surfaced by
this audit and are open: the wording of a repeated submission (§3), and the
key-selection shape in the read RPC (§6). **S-2 remains open. D-4 to D-8 remain
open. No implementation was prepared.**

### 15.21 · S-2, repeat submit, concurrency and key selection — LOCKED

**Still AUDIT ONLY.** No migration, no SQL change, no function, no policy, no
UI. Probes aborted; all eight homework tables held 0 rows before and after.

> **S-2.** An in-progress attempt is never deleted and never auto-converted. While
> membership is inactive the student cannot start, resume, save or submit; the
> attempt stays `in_progress`; if they rejoin and become active again they may
> resume it. No `abandoned` status and no cleanup in H5. **A permanently
> stranded `in_progress` attempt is an accepted lifecycle consequence, not a
> defect.**

> **Repeat submit.** Idempotent no-op: the first submit grades and transitions;
> later calls mutate nothing and return the same summary. A retry must never turn
> an already-successful submission into a student-visible error.

> **Concurrency.** A correctness requirement, not an optimisation: save and
> submit each lock the owning attempt with `FOR UPDATE` before validating and
> writing. No response write may commit after the attempt is `submitted`.

> **Key selection.** The correct answer and explanation are not selected at all
> unless the caller is entitled to see them — separate entitled / non-entitled
> branches rather than selecting the key and masking it.

---

#### 1 · Exact consequences

**S-2 costs nothing and enforces nothing.** Measured: after removal the attempt
was still `in_progress` with both responses intact — nothing deleted, nothing
converted. But **the membership block is the RPC's alone**: saving into a removed
student's in-progress attempt was **ACCEPTED at the table**. So S-2 and D-1's
"live-rechecked" clause rest entirely on H5 re-checking membership on **every
save and every submit**, not only at start. That must be an asserted contract,
the way §7's checks are — it is the single load-bearing line of the decision.

**A removed student keeps their own answers and loses the paper.** Measured: 2
response rows and 1 attempt row still readable through RLS (`own_read` has no
membership condition), and **0** question rows. Raw answers with nothing to read
them against. No key exposure; recorded as an oddity, not a hole.

**The composite consequence of D-1 + S-2, measured end to end.** Removed → the
teacher closes the paper → the student rejoins and is active again → the sitting
is still `in_progress` and, by the locked rules, still resumable and
submittable. **So a closed paper can receive a submission an arbitrary time after
it closed, from a student who had left the class in between.** That follows
directly from the two locks and is recorded here so it is a decision rather than
a surprise.

**Repeat submit: the summary needs no storage.** Measured — recomputing the
counts with no write returned exactly the first submit's figures
(1 correct / 1 wrong / 0 omitted / 2 total), so the no-op branch can serve the
same summary from a pure read.

#### 2 · Conflicts

**One, and it is with the repeat-submit lock.** The attempts guard raises
`22000` on *any* update to a submitted attempt — measured: a naive second flip
was refused. So an idempotent repeat submit must **branch on status before it
writes**, exactly as `teacher_exam_submit` does (`if a.status = 'in_progress'
then …`). *Attempting the write and catching the error is not the same thing*:
the guard raises rather than no-opping, and catching `22000` would also swallow
genuine failures.

No other conflicts. S-2 conflicts with nothing precisely because the attempt
stays `in_progress` and therefore stays writable at the table — which is why §1's
RPC obligation matters. The lock ordering conflicts with nothing. Key selection
is a shape choice inside a function that does not yet exist.

#### 3 · Functions and policies that will eventually need changing

| target | change | driver |
|---|---|---|
| `student_my_homework()` | `can_open` must become *may start* **or** *may resume*; and a surface that cannot open a paper needs to know why, so membership state is worth exposing | D-1, S-2 |
| `teacher_homework_students()` | *optional* — expose whether the student is still an active member, so the roster can tell a stranded sitting from an active one | S-2 |
| `teacher_homework_can_open()` | **none** — it is already exactly the new-start gate | D-1 (option a) |
| every policy | **none at all** | D-2 |

New functions H5 will add: a `can_resume`-shaped helper, the read RPC, start,
save, submit. Nothing else in the live schema is touched.

#### 4 · Lock ordering and deadlock implications

**One rule covers it: every write path takes the attempt row first, and nothing
takes it second.**

| path | order |
|---|---|
| save | lock the attempt → verify `in_progress` + authorization → write the response |
| submit | lock the attempt → verify `in_progress` → grade → flip |
| start | lock the **homework** row → check the gate → insert the attempt (a row that does not exist yet, so uncontended) |
| publish / close | lock the homework row — they already do |

Measured compatibility:

- **Readers are never blocked.** While `FOR UPDATE` was held on an attempt, the
  staff roster read still returned its 2 rows.
- **The response's own foreign key cannot deadlock against it.**
  `teacher_homework_responses_attempt_fk` is
  `FOREIGN KEY (attempt_id, homework_id) REFERENCES teacher_homework_attempts(id, homework_id)`,
  so a response write takes `KEY SHARE` on the parent attempt — a lock
  `FOR UPDATE` already dominates.

**The one way to create a genuine cycle, recorded so it is avoided:** `start`
holds the *homework* row and then touches an attempt. If `submit` ever took
`FOR UPDATE` on the *homework* row while holding the attempt — for instance to
read `due_at` when computing `late` — that is attempt → homework against start's
homework → attempt, and it can deadlock. **Submit must read the homework without
locking it.**

#### 5 · Does the accepted stranded attempt create a secondary authorization issue

**No authorization hole. Two non-authorization consequences and one obligation.**

1. **The roster cannot tell stranded from active.** Measured:
   `teacher_homework_students()` returned `in_progress / null` with no membership
   signal, so a sitting whose student left looks exactly like one still being
   worked on. An information gap the teacher will read wrongly — fixed by the
   optional change in §3, not by a permission.
2. **A removed student retains read access to their own answers** and none to
   the questions. Their own work, no key, no other student's data. Not a hole.
3. **The obligation from §1:** the database will happily let a removed student's
   attempt be written. S-2 is only true while every H5 write path re-checks
   membership live. If that check is ever dropped, removal silently stops
   meaning anything — and nothing in the schema would notice.

Nothing changes for `anon` (still nothing, everywhere), for staff parity, or for
cross-student isolation.

---

**Locked so far: D-1, D-2, D-3, S-1, S-2, repeat-submit semantics, the
save/submit locking rule, and the key-selection principle.** Still open: **D-4**
(enforce grade-before-submit or rely on convention), **D-5** (`late` frozen at
submit), **D-6** (audit labels for start/save/submit), **D-7** (staff answer
review surface), **D-8** (start idempotency wording), and the hardening items
**H-1** (no INSERT guard on attempts or responses), **H-2** (`last_answered_at`
mutable after submit) and **H-3** (the key sits behind RLS, not behind a grant).
**No implementation was prepared.**

### 15.22 · D-4 … D-8 LOCKED, and H-1/H-2/H-3 as H5 design requirements

**Still AUDIT ONLY.** No migration, no SQL change, no function, no policy, no
UI. The enforcement mechanisms below were **built and exercised inside an
aborting transaction** to measure feasibility rather than assert it; every probe
object rolled back. All eight homework tables held 0 rows before and after.

---

#### D-4 · Grading enforcement — measured feasible, three mechanisms, no conflict

| # | invariant | smallest mechanism | measured |
|---|---|---|---|
| 1 | a verdict exists **only** on a `submitted` attempt | a **deferred constraint trigger** on `teacher_homework_responses` (`AFTER INSERT OR UPDATE … DEFERRABLE INITIALLY DEFERRED`) | grade-then-flip **PASSES**; a verdict left on an `in_progress` attempt **REFUSED `22000`** |
| 2 | a verdict **agrees with the canonical rule** | an immediate `BEFORE INSERT OR UPDATE` trigger that recomputes through `exam_answer_matches()` | a verdict contradicting the key **REFUSED `22000`** |
| 3 | an attempt is **born `in_progress`** | one `BEFORE INSERT` branch on the existing attempts guard | a born-`submitted` attempt **REFUSED `22000`, even for the table owner** |

**Why #1 must be deferred, and why that is not exotic.** An *immediate* check
would refuse grading before the flip and so force the submit order to invert — a
decision, not a detail. A deferred check tests the **committed state** rather
than the statement order, so §15.20's locked order (lock → verify → grade →
flip) survives untouched. And this is an **established pattern in this
database**, not a new one: `referral_commission_rates.referral_rates_guard_trg`
is already `AFTER INSERT OR DELETE OR UPDATE … DEFERRABLE INITIALLY DEFERRED FOR
EACH ROW`.

Two properties to carry into the design:

- a deferred check reports at COMMIT, so an RPC bug appears as a commit-time
  error rather than at the offending statement. **It is a backstop, not the
  first line of defence** — the RPC still gets it right.
- **`SET CONSTRAINTS ALL IMMEDIATE` is sticky for the rest of the transaction.**
  Measured the hard way: it made a later probe fire early and misreport. Any
  code or test that forces the check must re-defer afterwards.

**#2 is "verify, don't compute", deliberately.** The trigger *calls* the
canonical authority; it does not restate it, and it does not create a second
one. Computing the verdict in the trigger would auto-grade on save, which D-3
forbids. So the RPC decides **when** a verdict is written and the database
decides **what** it must be.

#### D-5 · `late` — already frozen, no new mechanism needed

Measured end to end:

| step | result |
|---|---|
| due in 7 days, student one submits now | `late = false` |
| due moved to **yesterday**, student two submits | `late = true`, and student one is **still `false`** |
| due moved **30 days out** after both submissions | both unchanged |
| rewriting `late` directly on a submitted attempt | **refused `22000`** |
| after close: `set_due_at` refused, both verdicts still `false` / `true` | frozen |

The attempts guard already refuses every update to a submitted attempt, so D-5's
freeze **is enforced today** and H5 need only compute `late` once, in the submit
statement. One consequence to state rather than discover: two students on the
same paper can carry different verdicts, each true at their own submission
moment. That is what freezing means, and it is correct.

#### D-6 · Audit — the recommendation is **no new labels**, for a measured reason

The question was whether attempt creation is sufficient provenance for
`started`. It is — and the same argument covers `submitted`:

- `teacher_homework_attempts` records `user_id`, `homework_id`, `started_at`
  and `submitted_at`; the first four columns are immutable by guard, the row can
  **never be deleted**, and a submitted attempt is frozen entirely. Who, what and
  when are already permanent facts.
- **No existing audit label records a student's academic act.** Measured across
  all 22: the only match for start/submit/answer/attempt is
  `homework_answers_revealed`, which is a *teacher* act. **Teacher Exams — the
  more consequential system — audits no sitting events at all.** Every label in
  the log is either a container lifecycle change or a change in who can reach
  what.

Adding `homework_started` / `homework_submitted` would make homework the only
system that audits academic acts, would duplicate facts the attempt row already
holds permanently, and would cost a separate enum migration. **Recommendation:
neither label in H5.** If cross-entity chronology is wanted later, widen the log
for exams and homework together, as a deliberate change to what the log *means*.

#### D-7 · Staff review surface — the minimum field set

Precedent measured: `teacher_exam_results` returns `student_id, full_name,
status, started_at, submitted_at, total, correct, wrong, omitted` — **counts
computed, not raw rows** — and `teacher_exam_result_detail` returns jsonb with
`ordinal, prompt, format, given, correct_answer, is_correct` plus timing.

For homework, and trimmed rather than copied:

| surface | fields |
|---|---|
| roster | `student_id`, `student_name`, `attached_at`, `attempt_status`, `started_at`, `submitted_at`, `late`, `total/correct/wrong/omitted`, **and whether the student is still an active member** (S-2) |
| per-student detail | `ordinal`, `prompt`, `question_format`, `choices`, stimulus, the student's `answer`, `is_correct`, `correct_answer`, `explanation` |
| paper-level | `status`, `due_at`, `reveal_answers` |

Staff see the key here and that is not a leak — they authored it, and the H2
policy already lets them read `teacher_homework_questions` directly. **No timing
fields**: homework has none by design, so `ms_on_item` and `visit_count` have no
homework equivalent and must not be invented. Today's
`teacher_homework_students()` lacks `started_at`, the counts and the membership
signal.

#### D-8 · Start — the two gates differ by exactly one condition

```
resume  = attached · active membership · active workspace · an in_progress attempt exists
start   = attached · active membership · active workspace · status = 'published'
                                                            ^ the only difference
```

So `teacher_homework_can_open()` is already the start gate and stays untouched;
H5 adds one `can_resume`-shaped helper. Start then: lock the **homework** row
`FOR UPDATE` → look for an existing attempt → `in_progress` returns it →
`submitted` returns its state and never reopens (the attempts guard refuses a
reopen anyway, `22000`) → none, and the start gate passes, insert exactly one →
catch `unique_violation` and re-select so racing tabs converge on the same
attempt.

---

#### H-1 / H-2 / H-3 as first-class requirements

| finding | invariant | belongs in | smallest enforcement | conflicts | rollback |
|---|---|---|---|---|---|
| **H-1a** verdict while `in_progress` | a verdict exists only on a submitted attempt | **deferred trigger** — an RPC rule cannot bind the table owner or a future migration | the constraint trigger above | **none measured** — grade-then-flip passes | drop the constraint trigger by name, then its function |
| **H-1b** born-`submitted` attempt | an attempt is born `in_progress` | **trigger** — a CHECK cannot tell INSERT from UPDATE | one `tg_op = 'INSERT'` branch on the existing attempts guard | none | restore the guard body byte-for-byte and assert its md5, the H4 pattern |
| **H-1c** forged `is_correct` | a verdict agrees with `exam_answer_matches()` | **trigger** — a CHECK cannot read the key on another table | immediate BEFORE trigger, verifying not computing | none — canonical verdicts pass | drop trigger then function |
| **H-2** `last_answered_at` moves after submit | a submitted response is immutable in **every** column | **trigger** — the responses guard already refuses `answer` changes; add this column to the same test | one extra term in an existing condition | none | restore the guard body, assert md5 |
| **H-3** the key sits behind RLS with a table-wide grant | the key is unreachable by structure, not only by policy | **decision** | either leave it (identical to `teacher_exam_questions`) or revoke `authenticated` SELECT on `teacher_homework_questions` and serve staff reads through the D-7 RPC | revoking is **cheap now** — no homework UI exists — but commits the future authoring surface to RPC-only reads, diverging from `teacher-exams.html`, which reads exam tables directly | grant restoration is trivial; the surface cost is not |

**The load-bearing S-2 rule, restated as a contract obligation.** The database
will happily let a removed student's attempt be written — measured. So **every
student save and every submit must re-check live membership and workspace
authorization while holding the attempt lock.** Not start-time authorization,
and not a comment: an assertion in the contract suite, of the kind §7 already
carries. If it is ever dropped, removal silently stops meaning anything and
nothing in the schema would notice.

---

#### Complete H5 design implications

| | |
|---|---|
| **tables changed** | **none** |
| **policies changed** | **none** |
| **enum labels added** | **none** (D-6) |
| **triggers redefined** | `teacher_homework_attempts_guard_trg` (extend to INSERT) · `teacher_homework_responses_guard_trg` (freeze `last_answered_at`) |
| **triggers added** | verdict-truth (immediate) · verdict-state (deferred constraint trigger), both on `teacher_homework_responses` |
| **live functions redefined** | `teacher_homework_attempts_guard` · `teacher_homework_responses_guard` · `student_my_homework` · optionally `teacher_homework_students` |
| **functions added** | a `can_resume` helper · the student paper read · start · save · submit · the student result read · the staff review read(s) |
| **untouched** | `teacher_homework_can_open()`, `teacher_homework_is_staff()`, every policy, every table, the analyzer boundary |

**Remaining decisions — two, and only one has a cost beyond H5:**

1. **H-3** — revoke `authenticated` SELECT on `teacher_homework_questions`, or
   keep the shared pattern. Cheap now; commits H6's authoring surface to
   RPC-only reads.
2. **D-7's optional half** — whether the staff roster gains the active-membership
   signal, so a stranded sitting is distinguishable from an active one.

Everything else is locked: **D-1, D-2, D-3, D-4, D-5, D-6, D-7, D-8, S-1, S-2,
repeat-submit semantics, the save/submit locking rule, and the key-selection
principle.** **No implementation was prepared.**

---

### 15.23 · Teacher Homework H5 — PREPARED (2026-09-03)

**Status: 🟡 PREPARED, not applied.** Two files, `20260905a` (the increment)
and `20260905z` (its rollback). Nothing was applied to production; the
migration count is still **190** and the newest applied version is still
`20260903203209` (H4). The two remaining decisions from §15.22 are now locked
and implemented, so H5 has no open questions left — only an approval.

#### The last two decisions, as locked

**H-3 — the student read boundary is RPC-only.** `20260905a` executes
`revoke select on teacher_homework_questions from authenticated;`. The answer
key stops being separated from students by RLS alone and starts being
separated by the absence of any reach at all. Homework deliberately diverges
from Teacher Exams here, whose pages read the equivalent tables directly.

Two consequences, both measured in the dry-run rather than assumed:

1. **The staff-read policy on that table is deliberately LEFT IN PLACE**
   though nothing can now reach it. The policy is the *rule*; the grant is the
   *reach*. Keeping the rule means a future `GRANT` cannot silently hand
   students the key. §12 asserts the policy still exists.
2. **The revoke is role-wide, so it takes the TEACHER's direct read away too**
   — probe R2 measured a teacher's own `select` on `teacher_homework_questions`
   refused `42501` after the revoke. Staff keep their access through
   `teacher_homework_review()`, added here. Nothing live breaks: a repo-wide
   grep finds **no** client read of `teacher_homework_questions` or
   `teacher_homework_stimuli` anywhere, because the homework authoring page
   does not exist yet. **This is a bill H6 must pay** — see the findings below.

**D-7's optional half — the roster gains an active-membership signal.**
`teacher_homework_students()` is redefined to carry `active_member` plus the
per-student correct / wrong / omitted counts. A stranded sitting (S-2: a
removed student holding an in-progress attempt) is now *distinguishable* from
an active one. Nothing else changed: no cleanup, no abandonment, no monitoring,
no new lifecycle state — the signal is a fact on a read, not a mechanism.

#### The package

| | |
|---|---|
| forward | `supabase/migrations/20260905a_teacher_homework_h5.sql` — **942 lines** |
| rollback | `supabase/migrations/20260905z_teacher_homework_h5_rollback.sql` — **317 lines** |
| tables · policies · enum labels | **none added, none changed** — §12 asserts all three |
| live functions REDEFINED | **4** — `teacher_homework_attempts_guard` · `teacher_homework_responses_guard` · `student_my_homework` · `teacher_homework_students` |
| functions added | **8** — `teacher_homework_can_resume` · `student_homework_paper` · `student_homework_start` · `student_homework_save` · `student_homework_submit` · `teacher_homework_review` · `teacher_homework_verdict_guard` · `teacher_homework_verdict_state_guard` |
| triggers added | **2**, both on `teacher_homework_responses` — the verdict-truth guard (immediate) and the verdict-state guard (**deferred constraint trigger**) |
| grants | 8 client RPCs `authenticated`-only; the two guards callable by nobody; `anon` gains nothing; **`select` on `teacher_homework_questions` REVOKED from `authenticated`** |

> ⚠️ **It redefines four LIVE functions** — the `20260831e` hazard. The file's
> header records the four H4 md5s it replaces (`dacf16fd…`, `c5db8f03…`,
> `04198136…`, `01b0386d…`), §8 asserts each one, and `20260905z` restores all
> four **byte-for-byte**.

#### Why a deferred constraint trigger — the decisive finding

An **immediate** check that *"a verdict may exist only on a submitted attempt"*
would refuse the grading that happens **before** the status flip, and so would
force the submit order to invert. A **deferred** constraint trigger tests the
**committed state** instead of the statement order, so grade-then-flip
survives. This was measured both ways before the file was written, and it is
not a new pattern here — `referral_commission_rates` already carries a
`DEFERRABLE INITIALLY DEFERRED` constraint trigger.

It is a **backstop, not the first line**: a deferred check reports at COMMIT,
so the RPC still has to be right. And a note for anything that tries to force
it early — **`SET CONSTRAINTS ALL IMMEDIATE` is sticky for the rest of the
transaction** (measured; it made one audit probe fire early and misreport).

**Verify, never compute.** `teacher_homework_verdict_guard()` recomputes the
verdict through `exam_answer_matches()` — the platform's single grading
authority — and **refuses** one that disagrees. It does not *write* the value:
computing it in the trigger would grade on save, which D-3 forbids. The RPC
decides **when** a verdict is written; the database decides **what** it must
be. There is no second grading rule anywhere.

#### The dry-run — verbatim, aborting, on production

**Paste fidelity 12/12** bodies byte-identical to the repo file. Trigger firing
order on `teacher_homework_responses` read back as
`teacher_homework_responses_guard_trg` → `teacher_homework_responses_verdict_trg`
→ `teacher_homework_verdict_state_trg [deferred]`.

| probe | result |
|---|---|
| R1 student direct SELECT on questions | refused `42501` |
| R2 **teacher** direct SELECT on questions | refused `42501` — the grant is role-wide |
| S1 start | `resumed=false`, `in_progress`, 2 response rows pre-created |
| S2 start again (the racing tab) | `resumed=true`, same attempt — **D-8 idempotent** |
| S3 a raw second attempt | refused `23505` |
| S4 save (lowercase, padded) | `answer='b'`, `is_correct=NULL` — **saving never grades** |
| S5 submit | `{correct:1, wrong:0, omitted:1, total:2, late:false, status:submitted}` |
| S6 the deferred state guard under grade-then-flip | satisfied; 1 verdict, the omission still NULL |
| S7 submit AGAIN | **identical payload**, still one attempt row — idempotent |
| S8 save after submit | refused `42501` |
| V1 reveal=false, submitted | key absent; **own verdict present** — D-2 |
| V2 reveal=true, submitted | key `B` and the explanation both visible |
| V3 reveal=**true** but caller still in progress | key absent — **S-1: reveal is necessary, not sufficient** |
| C1 paper CLOSED, sitting in progress | save **accepted**; `can_open=false`, `can_resume=true` |
| C2/C3 resume and `my_homework` mid-sitting on a closed paper | resumes the same attempt; `can_open=true` for that student — **D-1** |
| C4 a NEW start on a closed paper | refused `42501` |
| M1/M2/M3 removed student saves · submits · resumes | all refused `42501` — **S-2, re-checked live** |
| M4 the attempt itself | survives untouched: `in_progress`, 2 answers |
| M5 rejoined, then saved and submitted a CLOSED paper | accepted, graded `2/0/0` |
| T1/T2 roster as teacher vs **ACTIVE assistant** | byte-identical — **parity** |
| T3 review as assistant | sat=true, key visible to staff |
| T4/T5/T6/T7 pending assistant · outsider read · outsider review · no session | all refused `42501` |
| A1 analyzer after **two full graded sittings** | **893 / 11 / 24 — unmoved** |
| A2 audit rows H5 wrote | **none** — only H3/H4's own labels appear; no start/save/submit label, by **D-6** |

**The dry-run found a real defect.** Probe H1c measured the owner forging a
verdict on an in-progress attempt as **ACCEPTED** — the truth guard verified
*agreement* but not *state*. The guard was corrected and re-tested; all four
forgery shapes are now refused:

| re-test | result |
|---|---|
| V1 verdict `true` on a **wrong** answer | refused `22000` |
| V2 verdict `false` on a **right** answer | refused `22000` |
| V3 INSERT a response **born** with a forged verdict | refused `22000` |
| V4 the **correct** verdict while in_progress | accepted by the *truth* guard… |
| V5 …then refused `22000` by the **state** guard | *"a verdict exists on an attempt that is in_progress"* |
| V6 grade-then-flip, same check | **passes** — the locked submit order is legal |

V4/V5 together are the point: the two guards are **separate rules**, and it
takes both to make a verdict mean something. An earlier probe of mine failed to
discriminate — it forged `is_correct=true` on answer `'b'` against key `'B'`,
which is a *correct* verdict, so its acceptance proved nothing. Re-run with
genuinely wrong verdicts, all four refuse.

#### Rollback rehearsal

`20260905z` refuses outright while **any** attempt exists — so, exactly like
H2's, its window closes at the first sitting. Rehearsed in an aborting
transaction:

```
trajectory  hw_functions / trg_responses / trg_attempts / questions_grant
            29 / 1 / 1 / true   →   37 / 3 / 1 / false   →   29 / 1 / 1 / true
TOTAL DIFFERING: 0
```

All eight hash families identical to pre-install: constraints `26715f0c…`,
counts `84/209/138/29/1/1`, grants `9642f485…`, homework bodies `2e2409fe…`,
homework signatures `8970c415…`, policies `1480dd9e…`, relations `01e30b21…`,
triggers `59ba9b5a…`. The rollback drops the triggers **before** the functions
they call, restores the four H4 bodies byte-identically (locally verified
against the H4 md5s: `dacf16fd…`, `c5db8f03…`, `04198136…`, `01b0386d…` — all
MATCH), and re-grants `select on teacher_homework_questions to authenticated`.

#### Verification

| | |
|---|---|
| contract suite | **422/422** (`tests/teacher-homework.test.mjs`, Part 6 adds ~55 H5 checks) |
| access-scope suite | **109/109** |
| CI | **66/66** |
| mutation suite | **65/65 killed**, none unapplied |

**Fourteen mutants survived the first pass**, and every one was a real gap in
the tests rather than a quirk of the mutant. The instructive ones:

- **`indexOf(...) === -1` sorts first and passes silently** (three separate
  checks). A check that asserts a needle is *absent* must also assert the
  positive form is *present*, or deleting the needle makes it pass. This is the
  vacuous-assertion rule wearing a new costume.
- **Submit stopped re-checking membership and nothing failed** — the
  load-bearing S-2 rule was in the code but not in the contract.
- `late` was computed but never asserted as *stored*; the state guard's
  condition, the responses guard's fail-closed branch, definer/`anon` posture,
  and the rollback's own refusal condition were all unasserted.
- **The rollback's restored bodies were compared as a string, not computed** —
  so a rollback restoring the *wrong* body would have passed. Now the suite
  hashes the file text itself.

**One check was removed rather than fixed.** My §12.9 asserted the analyzer
boundary by *naming* the analyzer tables in the migration — which breaks
`teacher-access-scope`'s blanket ban on homework migrations mentioning them at
all. The blanket ban is the stronger rule and was already enforced, so §12.9
was deleted as redundant, not weakened.

#### Final findings

1. **H-3 hands H6 a bill.** With `authenticated` holding no `select` on
   `teacher_homework_questions`, the homework authoring page (H6) cannot read a
   draft's questions the way `teacher-exams.html` reads its own. It will need a
   **staff authoring-read RPC** — `teacher_homework_review()` is per-student
   result review, not authoring. This is a consequence of a locked decision,
   not a defect, but it must be in H6's scope from the start.
2. **`20260905z`'s window closes at the first sitting**, and the *first sitting*
   is the entire point of H5 — so in practice this rollback is usable only
   between the apply and the first student who opens a paper. That is narrower
   than H4's window and should be treated as effectively single-use.
3. **The deferred guard reports at COMMIT.** Any future caller that batches a
   student write into a larger transaction gets the refusal at the end, not at
   the statement. Nothing does that today.
4. **`SET CONSTRAINTS ALL IMMEDIATE` is sticky.** Recorded again because it
   already cost one misreported probe in this increment.

**Production is unchanged.** Re-measured after every rehearsal: 190 migrations,
newest `20260903203209`; **0** of the 8 H5 functions and **0** of the 2 H5
triggers present; `authenticated` still holds `select` on
`teacher_homework_questions`; all eight homework tables at **0 rows**; audit log
**2** rows with **0** homework labels; analyzer **893 / 11 / 24**; all eight
hash families identical to the H4 baseline.

**Nothing is applied. H5 awaits explicit approval, and H6 has not started.**

---

### 15.24 · F-1 and F-5 LOCKED — H5 PREPARED, revision 2 (2026-09-04)

The two decisions the function-by-function review left open are now settled and
implemented. Still **nothing applied**: 190 migrations, newest `20260903203209`.

#### F-1 — removal after submission does not revoke the result

**LOCKED.** A student removed from the class **after** submitting keeps access to
their own submitted result, and to `correct_answer` + `explanation` when
`reveal_answers` is true. The sitting is finished and the result is theirs;
removal governs what they may still **do**, not what they already earned.
Removal still prevents a new start, a resume, a save and a submit, and a student
removed **while `in_progress`** stays under S-2 exactly as locked.

**This required no code change — the prepared read already behaved this way.**
What it required was an *assertion*, because the behaviour rested on one
un-asserted arm of a three-arm gate and nothing in the package would have
noticed a later edit dropping it. §12.8 now pins the arm, pins that it is a
third arm of an `OR` rather than the S-1 condition counted twice, and the
contract suite pins both plus the fact that save and submit are unmoved.

The asymmetry F-1 accepts, measured rather than argued:

| state at read time | paper read | key when reveal=true |
|---|---|---|
| removed **after** submitting | **accepted** | **shown** |
| removed **while in_progress** | refused `42501` | — |
| rejoined after removal | accepted | shown once submitted |
| never sat, reveal on | accepted | **withheld** (S-1) |

#### F-5 — the read boundary is RPC-only for both content tables

**LOCKED.** `20260905a` now revokes `authenticated`'s direct `select` on
**`teacher_homework_stimuli`** as well as `teacher_homework_questions`.

Stated honestly: **neither revoke closes a live leak.** RLS on both tables
carries a staff-read policy and nothing else, so a student's direct select
already returned zero rows — measured on the live catalogue, not assumed. What
the revokes remove is the *reach*, and with it the possibility that a future
policy makes the grant matter. The value is that the architecture is now one
thing rather than two:

```
Student → SECURITY DEFINER student read RPC → questions + stimuli → named fields only
```

Both staff-read **policies** stay in place though nothing can reach them — the
policy is the rule, the grant is the reach. The student RPC names its six
stimulus fields one by one (`kind`, `label`, `body`, `spec`, `media_ref`,
`media_kind`); `media_sha256` is a server-computed integrity value and stays
staff-only, and the ids and timestamps are internal. §12.8 counts each field
**per branch** — presence alone would let a field be dropped from one of the two
branches, so entitled and unentitled students would see different figures.

One check in §12.4 had to be **flipped rather than added**: before F-5 it
asserted that `teacher_homework_stimuli` *kept* its grant. The file now asserts
the opposite, and the contract suite asserts the old form is gone, so the
reversal is visible instead of silent.

#### Verification, re-run in full

| | |
|---|---|
| contract suite | **440/440** (was 422) |
| access-scope suite | **109/109** |
| CI | **66/66** |
| mutation suite | **81/81 killed** (was 65), none unapplied |
| production | unchanged — 190 migrations, 0 of 8 H5 functions, 0 of 2 H5 triggers, both grants still held, all eight homework tables 0 rows, audit 2 rows, analyzer 893/11/24 |

**Sixteen new mutants** cover the two decisions — reverting F-5, aiming the
revoke at the wrong table, narrowing §12.4 to one table, dropping the stimuli
policy assertion, leaking `media_sha256`, dropping a stimulus field from one
branch, the rollback leaving the stimuli grant revoked or over-granting to
`anon`, reverting F-1's third arm, turning it into an `AND`, dropping the
`submitted` condition, un-asserting it, and widening F-1 into `save`.

**Three survived the first pass, and all three were real test gaps:**

- **§12.4 narrowed to one table still passed** — the suite asserted the *message*
  but not the *set* it checks. A check that says the right sentence about the
  wrong list proves nothing.
- **A stimulus field dropped from one branch still passed** — the suite used
  `every(includes(...))`, which a two-branch function satisfies from one branch.
  Both the suite and §12.8 now count **per branch**.
- **The rollback granting `anon` a read still passed** — the scan matched only
  `to authenticated`. It now asserts no table grant to any other role.

#### The dry-run — verbatim, aborting, on production

The forward file installed with **§12 raising nothing**, which is the reachability
proof that matters: the rewritten §12.4 and §12.8 can go green, and the H3/H4
class of defect (*a check that could only ever raise*) is absent. Fixtures were
authored through the **real H3 RPCs** — create, save stimulus, save question,
publish — not raw inserts.

| probe | result |
|---|---|
| P1 both grants after the revokes | `questions=false stimuli=false` |
| P1b both staff-read policies | present |
| P1c the other four grants | all still `true` |
| P1d `anon` on both content tables | `false false` |
| P2 / P2b student direct SELECT | refused `42501` on **both** |
| P2c / P2d **teacher** direct SELECT | refused `42501` on both — role-wide, by design |
| P3 s1 sits and submits | `2 correct / 0 wrong / 0 omitted`, mcq `' b '`→B and grid-in `1.50`→1.5 |
| P3b stimulus fields the student receives | exactly `body, kind, label, media_kind, media_ref, spec` |
| P3c | `media_sha256` **absent** from the whole payload; key absent (reveal off); own verdict present |
| **P4 F-1** removed after submitting, reveal off | read **ACCEPTED**, `submitted`, own verdicts visible, key absent |
| P4b / P4c | save refused `42501`; start returns the submitted attempt (`resumed=true`) |
| **P4d F-1 + reveal on** | `answers_visible=true`, key `B`, explanation shown |
| **P5** removed mid-sitting | paper read refused `42501`, submit refused `42501` |
| P5c / P5d | rejoined → submitted `0c/1w/1o`; then sees the key |
| P6 / P6b roster | teacher ≡ ACTIVE assistant, **parity=true**; `active_member` reads `false` for the removed-but-submitted student and `true` for the rejoined one |
| P6c review as assistant | key visible to staff |
| P6d–P6g | pending assistant, outsider read, outsider review, no session — all `42501` |
| **P7** never sat, reveal **on** | `answers_visible=false`, **key absent** — S-1 holds for a non-sitter |
| P8 analyzer after two graded sittings | **893 / 11 / 24 — unmoved** |

#### Rollback rehearsal

`20260905z` restores **two** grants now, and §5.3 asserts both plus "no grant to
`anon`" plus both policies. Rehearsed aborting:

```
trajectory  84/209/138/29/1/1/q=true/s=true
        ->  84/217/138/37/3/1/q=false/s=false
        ->  84/209/138/29/1/1/q=true/s=true
TOTAL DIFFERING: 0
```

All eight hash families identical to pre-install. Both grants move together in
both directions, which is the property F-5 adds.

#### What did not change

No table, no policy, no enum label. The same four live functions are redefined,
the same two triggers added, the same eight functions added. `20260905z`'s
window still closes at the **first sitting**. **H6 still owes a staff
authoring-read RPC** — F-5 widens that bill from questions to figures as well.

**Nothing is applied. H5 remains PREPARED and awaits explicit approval.**

---

### 15.25 · Teacher Homework H5 — APPLIED (2026-09-04)

**H5 is LIVE.** Applied 2026-09-04 as version **`20260904003547`**, from the
PREPARED package at commit `1c645b4`, exactly as prepared and with no change
made during or after the apply.

**The homework system is now complete from code to grade.** A student can be
attached to a paper, open it, answer it, come back to it, submit it, and see
their result; staff can read the roster and review any student's sitting.

#### What was applied

| | |
|---|---|
| migration | `20260904003547` (`20260905a_teacher_homework_h5.sql`) |
| applied after | `20260903203209` (H4) — order confirmed before and after |
| migrations now | **191** |
| rollback artifact | `20260905z` — PREPARED, **not applied**, window closes at the first sitting |

#### 1 · Migration order and baseline

Last five applied, in order: `20260903123458`, `20260903175543`,
`20260903175957`, `20260903203209`, **`20260904003547`**. Public schema now
**84 tables · 217 functions · 133 policies (138 across all schemas) · 22 enum
labels**; homework **8 tables · 38 functions · 9 policies**.

Tables, policies and enum labels are **unchanged** — H5's own §12.1 asserted all
three during the apply, and the relations and policies hashes below confirm it
independently.

#### 2 · Paste fidelity — **12/12**

Every installed function body is **byte-identical** to `20260905a`, compared
against md5s computed from the repo file rather than retyped:

`teacher_homework_can_resume` `b122cb71…` · `teacher_homework_attempts_guard`
`33638efc…` · `teacher_homework_responses_guard` `df3c3a65…` ·
`teacher_homework_verdict_guard` `7ed96174…` ·
`teacher_homework_verdict_state_guard` `9bd87804…` · `student_homework_paper`
`ff8ba52d…` · `student_homework_start` `d0f918fd…` · `student_homework_save`
`f0f77954…` · `student_homework_submit` `2fa7f963…` · `student_my_homework`
`f123a599…` · `teacher_homework_students` `7e64a334…` · `teacher_homework_review`
`f572a0ee…`

**9/9 untouched**: the nine functions H5 does not own still carry their exact H4
bodies (`teacher_homework_is_staff` `63ef7fa2…`, `teacher_homework_guard`
`19bbc18c…`, `teacher_homework_can_open` `9ef8d477…`, `teacher_homework_create`
`4fca434e…`, `teacher_homework_rotate_code` `124b4acb…`,
`teacher_homework_delete` `f7f430e2…`, `student_attach_homework` `e601665a…`,
`teacher_homework_code_guard` `f54ea68a…`, `teacher_homework_code_available`
`d4758dfd…`).

#### 3 · Trigger inventory

| table | trigger | timing |
|---|---|---|
| `teacher_homework` | `teacher_homework_code_guard_trg` | `BEFORE INSERT OR UPDATE OF homework_code` (H4, unmoved) |
| `teacher_homework` | `teacher_homework_guard_trg` | `BEFORE DELETE OR UPDATE` (H2, unmoved) |
| `teacher_homework_attempts` | `teacher_homework_attempts_guard_trg` | **`BEFORE INSERT OR DELETE OR UPDATE`** — INSERT is new |
| `teacher_homework_responses` | `teacher_homework_responses_guard_trg` | `BEFORE DELETE OR UPDATE` |
| `teacher_homework_responses` | `teacher_homework_responses_verdict_trg` | `BEFORE INSERT OR UPDATE` |
| `teacher_homework_responses` | `teacher_homework_verdict_state_trg` | **`AFTER INSERT OR UPDATE … DEFERRABLE INITIALLY DEFERRED`** |

The deferred one reads back deferred **in the catalogue** (`tgdeferrable` and
`tginitdeferred` both true), not only in the DDL text.

#### 4 · Grants and revokes

| table | `authenticated` | `anon` |
|---|---|---|
| `teacher_homework_questions` | **false** | false |
| `teacher_homework_stimuli` | **false** | false |
| `teacher_homework`, `_access`, `_attempts`, `_responses` | true | false |
| `_retired_codes`, `_attach_attempts` | false | false |

Both staff-read **policies survive** (`teacher_homework_questions_staff_read`,
`teacher_homework_stimuli_staff_read`) though nothing can now reach them — the
policy is the rule, the grant is the reach.

All **8** client RPCs are `security definer`, `search_path` pinned,
`authenticated`-callable, `anon`-denied. Both verdict guards are callable by
**nobody**. `anon` holds EXECUTE on **0** homework functions.

#### 5 · F-1 behaviour, on the live functions

| probe | result |
|---|---|
| removed **after** submitting, reveal off | read **ACCEPTED**, `submitted`, own verdicts `true,true`, key absent |
| the same caller's save | refused `42501` |
| the same caller's submit | idempotent no-op, no write |
| removed + **reveal on** | `answers_visible=true`, key `B`, explanation shown |
| removed **while in_progress** — read / save / submit / resume | **all refused `42501`** |
| the stranded attempt | survives untouched: `in_progress`, 1 answer |
| rejoined → resume | `resumed=true`, the same attempt |
| rejoined → submit | graded `1c / 1w / 0o` |
| **never sat**, reveal **on** | `answers_visible=false`, **key absent** — S-1 holds |

#### 6 · F-5 behaviour

Student direct SELECT refused `42501` on **both** content tables; the
**teacher's** direct SELECT refused `42501` on both as well (the grant is
role-wide — staff read through `teacher_homework_review()`). The student RPC
returns exactly `body, kind, label, media_kind, media_ref, spec` and
**`media_sha256` appears nowhere in the payload**.

#### 7 · Lifecycle

Start creates one attempt and **2 response rows**; a racing second start returns
`resumed=true` on the same attempt (D-8). Save of `' b '` stores `'b'` with
`is_correct` **NULL** (D-3 — save never grades); the mid-sitting read shows no
key and no verdicts. Submit returns `2c/0w/0o`, verdicts become `true,true`, and
a **repeat submit returns the identical payload** with still one attempt row.
Save after submit is refused `42501`.

Close (D-1): the paper goes `closed` and **the attempt is untouched**;
`can_open=false` while `can_resume=true`; a save into the closed paper mid-sitting
is **accepted**; resume returns the same attempt; `student_my_homework().can_open`
reads **true** for that student; submit succeeds; and a **new** start on the
closed paper is refused `42501`.

`late` (D-5): a submission past `due_at` stores `late=true`; moving `due_at`
**30 days out afterwards leaves it true**; a direct rewrite is refused `22000`.

#### 8 · Hardening — every protection exercised as the TABLE OWNER

| attack | result |
|---|---|
| verdict `true` on a wrong answer | refused `22000` |
| verdict `false` on a right answer | refused `22000` |
| INSERT a response born with a forged verdict | refused `22000` |
| a **truthful** verdict while `in_progress` | accepted by the truth guard… |
| …then the **deferred state guard** when checked | **refused `22000`** — *"a verdict exists on an attempt that is in_progress"* |
| born-`submitted` attempt | refused `22000` (H-1b) |
| change a submitted answer | refused `42501` |
| move `last_answered_at` on a submitted answer | refused `42501` (H-2) |
| set `last_answered_at` NULL on a submitted answer | refused `42501` |
| re-grade / un-grade a graded item | refused `42501` / `42501` |
| reopen a submitted attempt | refused `22000` |
| delete an attempt / an answer | refused `42501` / `42501` |
| client INSERT an attempt, UPDATE a verdict, UPDATE a homework | refused `42501` ×3 |

The truthful-verdict pair is the point: **the two guards are separate rules**,
and it takes both for a verdict to mean anything.

> **One probe of mine was not discriminating, and the re-test says so.** The
> first `last_answered_at` nudge used `now()`, which is **frozen for the whole
> transaction** — it wrote the identical value `save()` had already written, so
> "ACCEPTED" meant *nothing changed*, not *the guard is open*. Re-run with
> `now() + interval '1 hour'` the write is **refused `42501`**, NULL is refused,
> and the control — the same write on an `in_progress` attempt — is **accepted**,
> so the check discriminates. This is the third time this session a probe passed
> for the wrong reason; the rule stands: *a green check is only evidence if it
> could have gone red.*

#### 9 · Parity

Teacher and **ACTIVE assistant** rosters are **byte-identical** (`PARITY=true`),
including the new `active_member` column, which correctly reads `false` for the
student removed after submitting and `true` for the rejoined one. The assistant's
review shows the key and the given answer. Pending assistant, outsider read,
outsider review, outsider start, and both no-session calls are all `42501`.

#### 10 · Analyzer — **893 / 11 / 24, unmoved**

Measured after two full graded sittings in one transaction and again after the
close/late/hardening transaction. Homework is structurally outside the analyzer.

#### 11 · Audit

The only rows H5's own operation wrote for the probe workspace came from H3/H4
verbs (`homework_created`, `homework_published`, `homework_answers_revealed`,
`student_removed`). **No start, save or submit label exists or was written** —
D-6, as designed. Production's audit log is back at **2 rows, 0 homework
labels**.

#### 12 · Suites

CI **66/66** · contract **440/440** · access-scope **109/109** · mutation
**81/81 killed**. (`scripts/check-migration-parity.sh` needs
`SUPABASE_SERVICE_ROLE_KEY`, which this session does not hold; migration count
and order were verified directly against `supabase_migrations.schema_migrations`
instead.)

#### 13 · New production baseline

| family | post-H5 | vs H4 |
|---|---|---|
| relations | `01e30b21…` | **UNCHANGED** — H5 adds no table |
| policies | `1480dd9e…` | **UNCHANGED** — H5 adds no policy |
| constraints | `38224217…` | moved |
| triggers | `f7b47479…` | moved |
| grants | `3ef5d986…` | moved |
| homework bodies | `d11919f4…` | moved |
| homework signatures | `d1222c2b…` | moved |

**The constraints move was measured, not assumed.** `create constraint trigger`
writes a `pg_constraint` row (`contype='t'`), so the family had to move. Hashing
every constraint **except `teacher_homework_verdict_state_trg`** returns
**`26715f0cc02574e1f727f64f18aaf8e1`** — byte-identical to the H4 baseline. So
that family moved by exactly one row, the deferred trigger, and H5 added no
CHECK, no foreign key, no UNIQUE and no primary key. Only two constraint
triggers exist in the whole schema: this one and
`referral_commission_rates.referral_rates_guard_trg`, the precedent it follows.

**Nothing survived the probes.** All eight homework tables are back at **0 rows**;
audit log **2 rows / 0 homework labels**; analyzer **893/11/24**.

#### Deviation to settle

**The migration file still says `STATUS: 🟡 PREPARED, not applied`.** The apply
instruction was *"do not modify the prepared package after apply"*, so neither
`20260905a` nor `20260905z` was touched — but every prior increment flipped that
header to `✅ APPLIED … as version …` on apply, and one contract check
(*"H5 is PREPARED and its rollback is unapplied"*) now asserts something that is
no longer true of production. The suite is green because it agrees with the file,
not with reality. **A one-line header change plus the matching test flip is
ready and awaits approval** — it is bookkeeping, not a change to any applied SQL.

**H6 has not started, and no UI was touched.** `20260905z` remains the active
rollback artifact, unapplied, and its window closes at the first real sitting.
H6 still owes a **staff authoring-read RPC** for questions and figures.

---

### 15.26 · Teacher Homework H6 — the staff read · AUDIT + PREPARED (2026-09-04)

**Status: 🟡 PREPARED, not applied.** Two files, `20260906a` and `20260906z`.
Production is untouched: **191** migrations, newest still `20260904003547` (H5).

#### Why H6 exists — the measured gap

F-5 revoked `authenticated`'s `SELECT` on **both** homework content tables. The
audit measured the consequence rather than inferring it, driving five ordinary
`user` profiles as the real `authenticated` role:

| role | `teacher_homework` | questions | stimuli | access | attempts | responses |
|---|---|---|---|---|---|---|
| teacher | 2 | **`42501`** | **`42501`** | 1 | 1 | 1 |
| ACTIVE assistant | 2 | **`42501`** | **`42501`** | 1 | 1 | 1 |
| pending assistant | 0 | `42501` | `42501` | 0 | 0 | 0 |
| student | **0** | `42501` | `42501` | 1 | 1 | 1 |
| outsider | 0 | `42501` | `42501` | 0 | 0 | 0 |

So **staff cannot read the paper they authored**, and the 13 H3 write RPCs
return only `uuid` / `void` / a two-key `jsonb` — no reshaping could serve a
read. Authoring is write-only and blind, and there is no path to edit an
existing question. That is the whole reason for this increment.

> **The first run of that matrix was wrong, and the correction matters.** It
> used the oldest profiles; profile #1 is a platform `owner` and #3 a
> `super_admin`, and both matched the staff-read policies' `has_role_at_least('admin')`
> arm — making a *pending assistant* appear to read three homework rows. That
> was the fixture, not the policy. It is also why H6's gates deliberately do
> **not** carry the admin arm: the RPC surface must not inherit that surprise.

Also measured: **the repository contains zero homework client code** — not one
reference to any homework table or RPC in any `.html` or `.js`. H1–H5 are live
with no UI at all. Nothing can break.

The contrast that shaped D6-3/D6-4: `teacher-exams.html` reads
`teacher_exams`, `teacher_exam_questions` and `teacher_exam_stimuli` with
**`select('*')`**, shipping `correct_answer`, `explanation` *and* `media_sha256`
to every staff browser. Recorded as an observation; D6-6 keeps it out of scope.

#### The seven decisions, as locked

| | |
|---|---|
| **D6-1** | dedicated read RPCs — the H3 write RPCs cannot serve reads |
| **D6-2** | exactly two: `teacher_homework_list` and `teacher_homework_paper` |
| **D6-3** | the list is RPC-only and gates on `workspace_is_active_staff` **before** it selects, so an unauthorized workspace id raises `42501` rather than returning an empty set — an empty set is a weak existence oracle |
| **D6-4** | `media_sha256` is **not** returned |
| **D6-5** | the F-5 revokes stay; no `GRANT` on any table appears in the file |
| **D6-6** | the Teacher Exams `select('*')` pattern is untouched |
| **D6-7** | no audit label; reads stay unaudited |

**D6-4 is a measurement, not a preference.** `stimulus-view.js`, the shared
renderer, consumes `spec` (66×), `kind`, `label`, `media_ref`, `body`,
`media_kind` — and `media_sha256` appears in **no client file in the
repository**. It is server-computed (`teacher_homework_save_stimulus` computes
it and ignores any client value). Nothing needs it.

#### The package

| | |
|---|---|
| forward | `20260906a_teacher_homework_h6.sql` — **378 lines** |
| rollback | `20260906z_teacher_homework_h6_rollback.sql` — **113 lines** |
| adds | **2 functions**, and nothing else |
| tables · policies · grants · triggers · enum labels | **none** |
| live functions redefined | **NONE** |

**That last row is the headline.** H3, H4 and H5 each redefined live functions
and each carried the `20260831e` hazard. H6 redefines nothing, so it carries
none of it — and §4.2 proves it by asserting **seventeen** live bodies are
byte-identical to what H5 left.

```
teacher_homework_list(p_workspace uuid) → TABLE
  homework_id, title, homework_code, status, due_at, reveal_answers,
  created_at, published_at, closed_at,
  question_count, attached_count, attempt_count, submitted_count

teacher_homework_paper(p_homework uuid) → jsonb
  { homework_id, workspace_id, title, instructions, homework_code, status,
    due_at, reveal_answers, created_at, published_at, closed_at,
    can_edit_content,
    stimuli:  [ id, kind, label, body, spec, media_ref, media_kind ],
    questions:[ id, ordinal, prompt, question_format, choices,
                correct_answer, explanation, stimulus_id ] }
```

Both `stable`, `security definer`, `search_path` pinned, `authenticated`-only,
`anon` denied, and **neither takes a lock**, so H5's homework→attempt lock order
is untouched. `can_edit_content` mirrors the condition
`teacher_homework_content_guard()` already enforces, so the page never has to
know that rule twice.

#### The dry-run — verbatim, aborting, on production

Paste fidelity **2/2**. Fixtures authored through the real H3 RPCs, with a
draft, a published paper carrying a submitted sitting, a closed paper, and a
second workspace owned by the outsider.

| probe | result |
|---|---|
| teacher / ACTIVE assistant | `list=3`, all three papers readable — **`PARITY=true`** on the full payload |
| pending assistant · student · outsider | **`42501`** on the list and on all three papers |
| cross-workspace (A's staff against B) | `42501`; B's own teacher sees B's 0 rows |
| list order | `DRAFT > PUBLISHED > CLOSED` |
| counts | draft `q2`; published `q1/at1/tr1/sub1` |
| stimulus keys | exactly `body, id, kind, label, media_kind, media_ref, spec` |
| question keys | exactly `choices, correct_answer, explanation, id, ordinal, prompt, question_format, stimulus_id` |
| key to staff | `correct_answer=B`, `explanation=why B` |
| **`media_sha256` anywhere in the payload** | **false** |
| `can_edit_content` | draft `true`, published `false`, closed `false` |
| **teacher's direct SELECT on questions / stimuli** | **still `42501`** — F-5 intact, the RPC is the only path |
| no session (list / paper) | `42501` / `42501` |
| **nonexistent workspace** | **`42501`, not an empty set** — D6-3 |
| nonexistent homework · `list(null)` | `42501` · `42501` |
| analyzer | **893 / 11 / 24 — unmoved** |
| audit | only H3's own labels; **no read label** — D6-7 |

**The dry-run caught a real defect.** §4.1 asserted the homework trigger count
was **8**; it is **12** (2 on `teacher_homework`, 2 on questions, 3 on
responses, 1 each on stimuli, access, attempts, retired_codes,
attach_attempts). I had guessed rather than measured, and the file refused to
install. Corrected in both files. That is the check working — a page earlier
than usual.

**A second defect was caught before the dry-run**, by the contract suite: §4.6
originally counted **bare column references** and required exactly one, but
`s.id` and `q.ordinal` are each legitimately named twice — once in the payload
and once in the `ORDER BY` that makes the array deterministic. That check could
**only ever have raised**, so the file could not have installed. It now counts
the **JSON pair**, because what must be unique is the *exposure*. Same shape as
the H3 §6.8 and H4 §7.8 findings.

#### Rollback rehearsal

```
trajectory: 84/217/138/37/q=false/s=false
         -> 84/219/138/39/q=false/s=false
         -> 84/217/138/37/q=false/s=false
TOTAL DIFFERING: 0
```

All eight hash families identical. Note the grant flags: **`q=false/s=false`
throughout** — F-5 is untouched in both directions, which `20260906z` §2.2
asserts explicitly so a future edit cannot widen this file into an F-5
reversal.

**`20260906z` has no window, and that is the point.** Every earlier homework
rollback closed — `20260902y` at the first attachment, `20260903z` once any
enum label was recorded, `20260904z` at the first rotation or draft deletion,
`20260905z` at the **first sitting**. This one never closes: nothing is
restored, no state can be stranded, so a refusal condition would be theatre and
its absence is deliberate rather than forgotten. Running it costs exactly one
thing — authoring goes blind again, which is the pre-H6 state, not a degraded
one.

#### Verification

| | |
|---|---|
| contract suite | **486/486** (Part 7 adds 45 H6 checks) |
| access-scope suite | **109/109** — H6 is in `FORWARD` and `ALL_ROLLBACK` |
| CI | **66/66** |
| H6 mutation suite | **46/46 killed** |
| H5 mutation suite (regression) | **81/81 killed** |

**Nine of the 46 mutants survived the first pass**, all real test gaps:

- a `0` literal replacing a count column passed, because the suite asserted the
  column *names* and not that each count is a real subquery;
- `to_jsonb(s.*)` shipped a whole row past a check that only knew `select s.*`;
- `to authenticated, anon` slipped past a regex that stopped at the first
  grantee;
- **three separate checks neutered to `if false then` still passed**, because
  the suite asserted the *message* and not the *condition* — the same gap three
  F-5 mutants exposed, and now pinned in five places;
- the rollback dropping `teacher_homework_review(uuid, uuid)` was invisible to a
  capture that only matched `(uuid)`.

One mutant was **replaced rather than fixed**: my first "the list filters rows
instead of raising" added a redundant filter while leaving the raise in place —
semantically equivalent, so its survival proved nothing. The replacement removes
the raise and relies on the filter, which is the actual oracle.

#### What H6 preserves

`teacher_homework_content_guard` (draft-only, fail-closed) · H4's code guard and
the retired-code invariant · H5's three response triggers, the attempts guard and
the lock order · the F-5 revokes · both staff-read policies · the analyzer
boundary. H6 reads only; it writes nothing anywhere, takes no lock, and names no
analyzer table.

**Nothing is applied. H6 awaits explicit approval, and no UI work has started.**

---

### 15.27 · Teacher Homework H6 — APPLIED (2026-09-04)

**H6 is LIVE.** Applied 2026-09-04 as version **`20260904012019`**, from the
PREPARED package at commit `d94f39c`, exactly as prepared. Only `20260906a` was
applied; `20260906z` was not touched.

**Staff can now read the paper they authored.** The gap F-5 opened — teacher and
ACTIVE assistant both refused `42501` on both content tables, authoring
write-only and blind — is closed, through the RPC boundary rather than by
handing the grant back.

#### 1 · Migration order and baseline

**191 → 192**, newest `20260904012019`, applied directly after `20260904003547`
(H5). Public: 84 tables · **219** functions · 138 policies · 22 enum labels.
Homework: 8 tables · **40** functions · 9 policies · 12 triggers.

#### 2 · Paste fidelity — 2/2, and 23/23 untouched

`teacher_homework_list` `bbeb59e0…` · `teacher_homework_paper` `473c8f7b…`,
both byte-identical to the file. Signatures read back exactly as prepared: the
list's thirteen columns, the paper's `jsonb`.

**23 of 23** live bodies from H2–H5 are byte-identical to the pre-H6 baseline —
including all four H5 redefined, both guards, `student_homework_*`,
`teacher_homework_review`, `teacher_homework_students`, both content guards and
`workspace_is_active_staff`. **H6 redefined nothing**, and that is now measured.

#### 3 · Grants and ACLs

| | `authenticated` | `anon` |
|---|---|---|
| `teacher_homework_questions` | **false** | false |
| `teacher_homework_stimuli` | **false** | false |

Both staff-read policies present. Both new functions: `definer=true`,
`pinned=true`, `stable`, `auth=true`, `anon=false`. **0** homework functions
`anon` may call.

#### 4 · The list, on the live function

| | |
|---|---|
| teacher vs ACTIVE assistant | **`PARITY=true`** on the full payload |
| ordering | `DRAFT > PUBLISHED > CLOSED` |
| counts | draft `q2/at0/tr0/sub0` · published `q1/at1/tr1/sub1` · closed `q1/at0/tr0/sub0` |
| nonexistent workspace | **`42501` — not an empty set** (D6-3) |
| `list(null)` | `42501` |

#### 5 · The paper, on the live function

Top-level keys: `can_edit_content, closed_at, created_at, due_at, homework_code,
homework_id, instructions, published_at, questions, reveal_answers, status,
stimuli, title, workspace_id`.

| | |
|---|---|
| stimulus keys | exactly `body, id, kind, label, media_kind, media_ref, spec` |
| question keys | exactly `choices, correct_answer, explanation, id, ordinal, prompt, question_format, stimulus_id` |
| key to staff | `correct_answer=B`, `explanation=why B` |
| **`media_sha256` anywhere in the payload** | **false** |
| `can_edit_content` | draft `true` · published `false` · closed `false` |
| teacher vs ACTIVE assistant | payloads **identical** |
| question order | `1,2` |

#### 6 · Denial

| role | list(A) | draft | published | closed | list(B) |
|---|---|---|---|---|---|
| teacher | 3 | ok | ok | ok | **`42501`** |
| ACTIVE assistant | 3 | ok | ok | ok | **`42501`** |
| pending assistant | `42501` | `42501` | `42501` | `42501` | `42501` |
| student | `42501` | `42501` | `42501` | `42501` | `42501` |
| outsider | `42501` | `42501` | `42501` | `42501` | 0 (B is theirs) |

No session: list and paper both `42501`.

#### 7 · F-5 after H6 — still closed

Driven as the real `authenticated` role: the **teacher's** direct SELECT on
`teacher_homework_questions` and `teacher_homework_stimuli` is **still refused
`42501`**, and so is the student's. The RPC is the only path, which is the whole
architecture D6-5 protects.

#### 9 / 10 · Analyzer and audit

Analyzer **893 / 11 / 24 — unmoved**. The only audit rows the probe workspace
carried came from H3 verbs (`homework_created`, `homework_published`,
`homework_closed`); **no read label exists or was written** (D6-7). Production's
audit log is back at 2 rows, 0 homework labels; all eight homework tables at 0
rows.

#### 12 · Suites

CI **66/66** · contract **486/486** · access-scope **109/109** · H6 mutants
**46/46** · H5 mutants **81/81** · H4 mutants **75/75**.

#### 13 · New baseline — the cleanest hash profile in the vertical

| family | post-H6 | vs pre-H6 |
|---|---|---|
| constraints | `38224217…` | **UNCHANGED** |
| policies | `1480dd9e…` | **UNCHANGED** |
| relations | `01e30b21…` | **UNCHANGED** |
| triggers | `f7b47479…` | **UNCHANGED** |
| **grants** | `3ef5d986…` | **UNCHANGED** — F-5 untouched, no table grant added |
| homework bodies | `05386146…` | moved |
| homework signatures | `4b3066a1…` | moved |

**Five of seven families did not move at all.** H5 moved five of seven; H6 moves
two. That is what "two read functions and nothing else" looks like measured
rather than claimed.

#### 14 · Rollback

`20260906z` is **PREPARED and unapplied**, byte-identical to its prepared state
(`446c88c8…`), still reading `STATUS: 🟡 PREPARED, deliberately unapplied`.
**Its window never closes** — nothing is restored, no state can be stranded.

#### Bookkeeping

Per the repository convention and the explicit apply instruction, `20260906a`'s
`STATUS:` header now reads `✅ APPLIED 2026-09-04 as version 20260904012019`,
and the one contract assertion flipped with it. **Comment-only in the
migration** — a diff filter stripping `--` lines and blanks returns nothing, and
both installed body hashes still match the file. The flipped assertion was
mutation-checked: naming the wrong version makes it fail.

**H7 has not started, and no UI was touched.** The homework vertical now runs
end to end — author, publish, attach, sit, grade, review, and read back — with
no client code anywhere in the repository.

### 15.28 · Teacher Homework H7 — the staff UI · DECISIONS LOCKED + AUDIT-ONLY (2026-09-04)

Read-only, after H6 was accepted and the roadmap checkpoint approved. **No code,
no UI, no SQL, no migration.** Production is untouched (newest migration still
`20260904012019`, CI 66/66 at `93369c8`). This section records the six decisions
the owner locked before H7, the audit of the surface H7 will be built on, two
corrections to the premises those decisions were made under, and the proposed
H7 UI contract — screens, states, wireframes — that waits for approval.

#### The six decisions, as locked

1. **Re-numbering.** §15.14 planned *H6 staff UI → H7 student UI and the
   dashboard card*. The applied `20260906a` is the **staff-read backend layer**,
   recorded as **H5.5**. From here: **H7 = Staff Homework UI**, **H8 = Student
   Homework UI + the dashboard card**.
2. **Staff UI read boundary.** H7 reads the paper through
   `teacher_homework_list()` and `teacher_homework_paper()` **only**. No direct
   SELECT from any homework table in the staff client — `teacher_homework`
   included, even though its `authenticated` SELECT grant remains.
3. **`exam.html` reachability.** The 3g player must gain a real product entry
   point and must not stay URL-only. Not implemented inside H7 unless the shared
   UI architecture strictly requires it; recorded as a separate item (I-1 below).
4. **The dashboard card.** *From your teachers* is one unified student
   assignment surface for **Homework and Teacher Exams**. H8 owns the Homework
   implementation. H7 does no dashboard work.
5. **Teacher Exams `select('*')`.** Not modified now; recorded as a separate
   future hardening item outside H7/H8 (I-2 below).
6. **Class-patterns card.** The H7 merge must not deploy it as a side effect;
   isolate and record. **This premise is wrong by fact — see correction C-1.**

#### Two corrections before anything is built

**C-1 · The class-patterns card is already in production.** The card's commit
`4e468d3` is on `origin/main`; `teacher.html` is byte-identical between this
branch and `main`; Vercel's newest *production* deployment is `7422cba` (main,
READY), created after `4e468d3`. Nothing on this branch can deploy the card
because the branch does not differ from `main` in it. Decision 6 is therefore
moot, and CLAUDE.md's *"in the repo and NOT deployed"* row is stale (I-5).

**C-2 · The "Teacher Exams" sidebar link is hidden by `nav.js`'s staff filter
in the common timing — a live defect in the navigation H7 must use.**
`teacher.html` loads `nav.js` (`defer`). For ACTIVE staff, `applyStaffNav()`
sets `display:none` on every sidebar `a.nav-item` whose file is not in
`STAFF_NAV_KEEP = { teacher, partner, profile, settings }` — and runs **four
times**: at once, next frame, +500 ms, +1500 ms after its identity read.
`teacher-exams.html` is not in that list. `renderWorkspace()` reveals
`sideExamsLink` **once**, after `teacher_my_workspaces` → roster → patterns
(three sequential round trips). Whichever runs last wins. Executed with the
shipped filter over `teacher.html`'s real sidebar, in browser order:

```
teacher.html sidebar links: dashboard chat progress teacher teacher-exams(hidden) partner(hidden) profile settings
0. markup as shipped                              exams="none"  partner="none"
1. nav.js applyStaffNav (first pass)              exams="none"  partner="none"
2. teacher.html renderWorkspace() reveals both    exams=""      partner=""
3. nav.js applyStaffNav (+500ms / +1500ms pass)   exams="none"  partner=""
```

Partner survives because `partner.html` is in the keep-list; Teacher Exams does
not. The browser order was not measured with a real session — what is proven is
that any filter pass **after** the reveal hides the link, and the filter's last
pass is 1.5 s after `nav.js` resolves. `tests/staff-nav.test.mjs` §6 restates
the keep-list as exactly four and treats a hidden `teacher-exams.html` as
*correct* — the suite encodes the defect as the expectation. No test covers the
reveal-then-filter order. **An H7 link placed the same way is hidden the same
way**, so this is the one real missing capability the audit found, and it is in
navigation, not the backend (I-4).

#### The audit — what H7 is built on

**A · `teacher.html` (the hub).** Tokens `--bg --cyan --green --amber --red
--text-100…500 --border --purple --gold --space-* --r-sm…xl`; fonts Manrope /
DM Sans / JetBrains Mono from Google Fonts; fixed sidebar `--side-w:262px`.
States `loadingState / noneState / pendingState / wsState` through `show()`.
`boot()` → `getSession()` → `api.myWorkspaces()` → `rows.find(staff_status ===
'active')` (the first active workspace only); a pending assistant lands on
`pendingState`. `S.isTeacher` gates **only** Partner, staff, activity and
referrals; `sideExamsLink` is revealed with no role test and a comment saying
why. `?preview=1` fixture mode exists. No `.rpc` for homework anywhere.

**B · `teacher-exams.html` (the template).** 815 lines, no sidebar, no
`nav.js`, a *← Teaching* link back. `<head>` pins supabase-js 2.110.8, KaTeX
0.16.11 (+ auto-render) with SRI, loads `stimulus-view.js`. Four states
`loadingState / denyState / listState / examState`. `sb` constructed
defensively; `boot()` → session or `login.html` → `teacher_my_workspaces` →
`staff_status === 'active'` or `denyState` → `wsPick` (all active workspaces)
→ list. Helpers `$ esc say clearMsg math show localDT toISO`. `api` = reads by
`.from(...).select('*')` (the pattern decision 5 sets aside) and every write by
`.rpc`. Draft-only editing (`fTitle fInstr … disabled = !draft`), code panel
hidden while draft, rotate only while published, `publishCard` hidden when
closed. Stimulus form → `stimulusFromForm()`; SVG via `FileReader.readAsText`,
`/<svg/i`, `btoa(unescape(encodeURIComponent()))`; question form →
`questionFromForm()` (`choices = ['A','B','C','D'].map(...)`); preview through
`window.StimulusView.render`; `move(id, delta)` sends the whole id list;
`confirm()` is not used on the exam page (teacher.html uses it for rotate,
remove, withdraw).

**C · Design system and delivery constraints.** `vercel.json` CSP: `script-src
'self' cdn.jsdelivr.net`, `img-src 'self' data: blob: <supabase>`,
`connect-src <supabase>` — the base64 SVG figure renders under `img-src data:`.
`tests/repo-integrity.test.mjs` runs on **every** root `*.html`: the inline
script must parse, every jsdelivr tag must carry `integrity` + `crossorigin`,
no floating supabase-js version. `validate-knowledge-layer.mjs` enumerates a
fixed public page list, so a `noindex,nofollow` staff page trips nothing there
(as `teacher-exams.html` did not). Staff pages are absent from `sitemap.xml`
and `llms.txt` and must stay absent; `robots.txt` does not list them — the meta
tag does the work.

**D · Auth, loading, error.** The convention is `const { data, error } = await
sb.rpc(...)`; `error.message` shown verbatim through `say(el, msg, 'err')`.
The homework RPCs were written for that: *this homework is published and its
paper is fixed* (`42501`), *this homework is closed* (`22023`), status-specific
delete refusals. No in-flight button locking anywhere in the staff pages.

**E · Reuse map.** *By call, unchanged:* `stimulus-view.js` (`render`, `esc`,
`KINDS`), KaTeX `math()`, `teacher_my_workspaces()`. *As template, copied:*
the `<head>` pins, the four-state `show()`, `boot()`, the message row, the
stimulus and question forms, the SVG reader, preview, `move()`, the code panel
with Copy. *Not reusable, and not to be:* the access queue (`requests`,
`decide`, `approveMembers` — homework has no queue), `fDur fCalc fOpens
fCloses` (exam-only fields; `teacher_homework_update` takes title +
instructions), the `results` counts table (replaced by the H5 roster and
review), every `.from()` read.

**F · Capabilities H7 needs against what exists.**

| Action | RPC (all live) | Returns | Status rule |
|---|---|---|---|
| list papers | `teacher_homework_list(p_workspace)` | 13 columns incl. counts | active staff of the class (`42501`) |
| open paper | `teacher_homework_paper(p_homework)` | jsonb: header + `can_edit_content` + stimuli[] + questions[] (key included, no `media_sha256`) | staff of the paper |
| create | `teacher_homework_create(p_workspace, p_title)` | `{homework_id, homework_code}` | — |
| title / instructions | `teacher_homework_update(p_homework, p_title, p_instructions)` | void | draft only |
| due date set / clear | `teacher_homework_set_due_at(p_homework, p_due_at)` (NULL clears) | void | not closed |
| reveal answers | `teacher_homework_reveal_answers(p_homework)` | void | any status, **one-way** |
| stimulus save | `teacher_homework_save_stimulus(p_homework, p_stimulus, p_kind, p_label, p_body, p_spec, p_media_ref)` | uuid | draft (content guard) |
| stimulus delete | `teacher_homework_delete_stimulus(p_stimulus)` | void | draft |
| question save | `teacher_homework_save_question(p_homework, p_question, p_ordinal, p_prompt, p_format, p_correct_answer, p_choices, p_explanation, p_stimulus)` | uuid | draft |
| question delete | `teacher_homework_delete_question(p_question)` | void | draft |
| reorder | `teacher_homework_reorder_questions(p_homework, p_question_ids)` | void | draft |
| publish | `teacher_homework_publish(p_homework)` | `{homework_id, homework_code, questions}` | draft, gate: ≥1 question, ordinals 1..n |
| close | `teacher_homework_close(p_homework)` | void | published |
| rotate code | `teacher_homework_rotate_code(p_homework)` | new code | not closed (UI offers it only while published) |
| delete | `teacher_homework_delete(p_homework)` | void | draft only; deletes its own content first |
| roster | `teacher_homework_students(p_homework)` | 12 columns incl. `active_member`, counts | staff |
| review one student | `teacher_homework_review(p_homework, p_student)` | `{sat:false}` or items[] with given / verdict / key | staff |

Column limits the forms should mirror: title 2–200, instructions ≤ 4000, label
1–200, body 1–8000, prompt 1–8000, explanation ≤ 8000, `media_ref` ≤ 256 KiB.

**No backend capability is missing.** *Stimulus reorder* is not a concept —
stimuli carry no ordinal and the paper orders them `created_at, id`, as the exam
page does. *Un-reveal*, *reopen* and *edit after publish* are refused by design
(§15.16, §15.17). The only gap is C-2, in `nav.js`.

**G · Parity.** The page gates on `staff_status === 'active'` and never reads
`staff_role`; teacher and active assistant see and do the same thing, as every
homework RPC already enforces (`teacher_homework_is_staff()` is role-blind).

#### Proposed H7 UI contract — for approval

**Page.** `teacher-homework.html` at the root, `<meta name="robots"
content="noindex,nofollow">`, no `nav.js`, *← Teaching* back link, the exam
page's `<head>` pins copied byte-for-byte, `stimulus-view.js` loaded.

**Reads, and nothing else:** `teacher_my_workspaces()` (the picker),
`teacher_homework_list()`, `teacher_homework_paper()`,
`teacher_homework_students()`, `teacher_homework_review()`. **Zero `.from(`
calls** — the contract suite asserts the count is 0, stricter than the exam
page's own-tables rule. **Writes:** the thirteen H3 RPCs above, by `.rpc` only.

**Gate.** `getSession()` or `login.html`; active-staff rows or `denyState`
(*This page is for the staff of a class. Ask the teacher whose class it is.*);
a library that failed to load → `denyState` with its own sentence.

**Navigation.** `teacher.html` gains `<a class="nav-item"
href="teacher-homework.html" id="sideHomeworkLink" style="display:none">` beside
`sideExamsLink`, revealed in `renderWorkspace()` on the same line and with no
role test. **This link is hidden by C-2 unless `nav.js`'s keep-list learns
both `teacher-exams.html` and `teacher-homework.html`** (I-4).

**States.** `loadingState` → `denyState` | `listState` | `paperState`; inside
`paperState` a roster card and a review drawer. Every card owns one `.msg` row.

```
LIST (listState)                                   ┌─────────────────────────┐
 ← Teaching     Homework                          │ class ▾ [Class A]        │
 Papers you set for Class A.                      │ [+ New homework]         │
 ┌────────────────────────────────────────────┐    └─────────────────────────┘
 │ ● draft      Untitled homework   4 questions │  (tile → paperState)
 │ ● published  Linear systems      8 questions · code 7KQ2M9XA · due Sep 12 · 12 attached · 5 submitted │
 │ ● closed     Ratios              6 questions · closed Sep 1 · 20 submitted │
 └────────────────────────────────────────────┘
 empty: "No homework yet. Create one and it starts as a draft."
```

```
PAPER (paperState) — draft                    PAPER — published / closed
 ← All homework   [Linear systems] ● draft      ← All homework   Linear systems ● published
 ┌ Paper ───────────────────────────┐          ┌ Paper ──────────────────────┐
 │ Title [..............]           │          │ Title / Instructions (read-only, greyed)
 │ Instructions [...............]   │          └─────────────────────────────┘
 │ [Save]   [Delete draft]          │          ┌ Code ───────────────────────┐
 └──────────────────────────────────┘          │ 7KQ2M9XA  [Copy] [Rotate]   │  closed: hidden, "Closed on …"
 ┌ Schedule & answers ──────────────┐          └─────────────────────────────┘
 │ Due [datetime-local] [Set] [Clear]           ┌ Schedule & answers ─────────┐
 │ Answers: [Reveal to students]    │          │ Due … [Set][Clear] (closed: disabled)
 │   — one-way, needs confirm       │          │ Answers: [Reveal] / "Revealed on …"
 └──────────────────────────────────┘          └─────────────────────────────┘
 ┌ Stimuli ─────────────────────────┐          ┌ Stimuli (read-only previews) ┐
 │ kind ▾ label body spec [file]    │          ┌ Questions (read-only, key visible to staff) ┐
 │ [Preview] [Save] · list: Edit/Delete        ┌ Students ───────────────────┐
 └──────────────────────────────────┘          │ name · in class? · attached · status · submitted · late · ✓ ✗ — · [Review]
 ┌ Questions ───────────────────────┐          │ empty: "Nobody has attached this homework yet."
 │ fmt ▾ stimulus ▾ prompt A B C D  │          └─────────────────────────────┘
 │ answer explanation [Preview][Save]           ┌ Review: <student> ──────────┐
 │ list: #1 … ↑ ↓ Edit Delete       │          │ 1. prompt · given B · ✓ · key B · explanation
 └──────────────────────────────────┘          │ sat=false: "Has not opened this homework."
 ┌ Publish ─────────────────────────┐          │ note: "Students see the key: yes/no"
 │ hint from the gate   [Publish]   │          └─────────────────────────────┘
 └──────────────────────────────────┘          [Close homework]  (published only)
```

**Status matrix — what each control does.**

| Control | draft | published | closed |
|---|---|---|---|
| Title / instructions | editable, Save | read-only | read-only |
| Due date Set / Clear | ✓ | ✓ | disabled (`22023`) |
| Reveal answers (one-way, confirm) | ✓ | ✓ | ✓ |
| Stimulus add / edit / delete | ✓ | hidden, previews only | hidden |
| Question add / edit / delete / ↑↓ | ✓ | hidden, read-only list | hidden |
| Publish (confirm: *fixes the paper*) | ✓ + gate hint | — | — |
| Code panel + Copy | hidden (a draft's code is `no_match` to students) | ✓ | hidden; *Closed on …* |
| Rotate (confirm) | hidden | ✓ | hidden |
| Close (confirm) | — | ✓ | — |
| Delete | ✓ (draft only, confirm) | hidden | hidden |
| Students roster + Review | hidden (nothing can attach) | ✓ | ✓ |

**Empty, loading, error.** List empty sentence above; roster empty sentence
above; review `sat:false` sentence above; every RPC error → `say(msg,
error.message, 'err')` verbatim, as the exam page does; page-level spinner
only in `loadingState`, per-card `.msg` otherwise.

**Responsive.** `.wrap{max-width:1080px}`, `.grid2` as `auto-fit minmax(200px,
1fr)` (collapses by itself), the roster table inside an `overflow-x:auto`
container, `datetime-local` given `min-width:0; max-width:100%` (the rule
`teacher-surface.test.mjs` already enforces on `teacher.html`).

**Escaping.** `esc()` on every author string; KaTeX only through `math()`;
figures only through `StimulusView.render` (sandboxed `data:` image); no own
SVG markup.

**Confirmations.** `confirm()` before publish, close, rotate, reveal and
delete — the five irreversible or student-visible actions; `teacher.html`
already uses `confirm()` for rotate and remove, the exam page uses none.

**Tests H7 ships with.** `tests/teacher-homework-ui.test.mjs`, modelled on
`teacher-exam-ui.test.mjs`: every `.rpc` name defined by an applied homework
migration; **`.from(` count is 0**; never `.insert/.update/.upsert/.delete(`;
gate on `staff_status === 'active'`, no `staff_role`, no `isTeacher`;
`denyState`; `login.html`; `teacher.html` links to the page and reveals it
without a role test; `stimulus-view.js` loaded and `StimulusView.render` used,
no own SVG; all six kinds offered; SVG base64 + non-SVG refused;
`.pill.draft/.published/.closed`; editing shut after draft; code panel only
once published; rotate only while published; reorder sends the whole list;
`confirm()` before the five actions; `esc()` defined and no raw
interpolation; the three empty sentences present. Mutation-tested like every
homework suite. `staff-nav.test.mjs` restated if I-4 is approved.

**What the merge deploys.** Merging to `main` deploys the new page and the
`teacher.html` link (and `nav.js` if I-4) to production at once — INFRA-2's
missing approval gate still applies, and nothing else on this branch differs
from `main` in any shipped page.

**H7 will not:** touch student UI, the dashboard, `teacher-exams.html`,
`exam.html`, the class-patterns card, any migration, any RPC, or any policy.

#### Separate items recorded

- **I-1 · `exam.html` entry point** (decision 3). Decisions 3 and 4 converge:
  the unified *From your teachers* card is the natural entry point for the 3g
  player. H8 builds the Homework half; the Teacher Exams half is scheduled on
  its own, outside H7.
- **I-2 · Teacher Exams read boundary** (decision 5). `teacher-exams.html`
  reads `teacher_exams`, `teacher_exam_questions` and `teacher_exam_stimuli`
  with `select('*')`. Not a leak today — 3b's SELECT policies are staff-only,
  measured in the 3f audit — but the boundary's *shape* is the one H5's F-5
  and H6's D6-1…D6-4 replaced for homework: table reads, every column shipped
  (`media_sha256` included), a student-side grant still held on the questions
  and stimuli tables. The hardening mirrors H6: two staff read RPCs, then the
  F-5 revokes. Outside H7/H8.
- **I-3 · Class-patterns card** (decision 6). Moot by C-1: on `main`, deployed
  at `7422cba`. Nothing to isolate.
- **I-4 · `nav.js` keep-list** (C-2). Add `teacher-exams.html` and
  `teacher-homework.html` to `STAFF_NAV_KEEP`; restate the two keep-list
  assertions in `staff-nav.test.mjs`; add the reveal-then-filter order as a
  test so it cannot come back. Recommended as its **own small fix before H7**,
  because it repairs the live Teacher Exams link, and because H7's link is
  otherwise hidden on arrival. It touches `nav.js`, a shared file — explicit
  approval either way.
- **I-5 · CLAUDE.md stale rows.** *Static site*: the class-patterns card **is**
  deployed (C-1). *Edge Functions*: `ai-tutor` platform version is **145**, not
  144 (read 2026-09-03). Bookkeeping only; awaiting approval with H7.

#### Questions that must be answered before a line of H7

- **Q1** Decision 2 names two RPCs. The roster and review screens need
  `teacher_homework_students()` and `teacher_homework_review()` (H4/H5, staff
  gated), and the class picker needs `teacher_my_workspaces()`. Read as *no
  table reads* — confirm these three RPCs are inside the boundary.
- **Q2** I-4: fix `nav.js` first (recommended), inside H7, or not at all?
- **Q3** Roster and review inside the paper screen (proposed) or a separate
  screen?
- **Q4** Hide a draft's code as the exam page does (proposed), or show it?
- **Q5** `confirm()` before publish / close / rotate / reveal / delete
  (proposed), or none, as the exam page?
- **Q6** Approve I-5's CLAUDE.md correction as part of H7's bookkeeping?

**STOPPED here.** Audit only; nothing prepared, nothing applied, no UI written.

### 15.29 · Teacher Homework H7 — the staff UI · PLAN (2026-09-04)

The audit of §15.28 was approved and its six questions answered. This section
records the decisions as locked, then the plan: file list, state matrix,
RPC-to-UI mapping, the `nav.js` patch and the test plan. **H7 is UI/product
work only** — no migration, no table, no policy, no grant, no backend function,
no change to H1–H6 behaviour, no student UI, no dashboard, no Teacher Exams
content or read architecture, no analyzer change.

#### 1 · The six decisions, LOCKED

1. **Re-numbering.** Applied `20260906a` is the staff-read backend layer,
   **H5.5**. **H7 = Staff Homework UI. H8 = Student Homework UI + the unified
   *From your teachers* dashboard card** (Homework and Teacher Exams).
2. **RPC-only read boundary, confirmed to five.** `teacher_my_workspaces()`,
   `teacher_homework_list()`, `teacher_homework_paper()`,
   `teacher_homework_students()`, `teacher_homework_review()` are all inside
   the boundary. The client makes **zero `.from()` calls** — asserted as a
   count of zero, not as a table allow-list, which is stricter than the rule
   `teacher-exams.html` is held to.
3. **`nav.js` is fixed inside H7.** C-2 is a live navigation defect, not scope
   expansion: the smallest possible patch, no redesign of navigation,
   permissions, routing or role semantics, `staff_status === 'active'`
   semantics kept, no `staff_role` gate introduced, and regression coverage so
   it cannot silently return.
4. **Roster and review live inside the paper screen.** Homework → paper →
   roster → select student → review. No separate page.
5. **A draft's code is hidden.** `homework_code` appears only once published,
   with Copy and Rotate. No usable-looking access code before publish.
6. **`confirm()` before publish, close, rotate, reveal and delete** — those
   five and no others invented. Backend one-way and final semantics respected.

Bookkeeping approved with H7: CLAUDE.md's two stale facts (the class-patterns
card is deployed; `ai-tutor` platform version is 145) are corrected, and
nothing else in the documentation is touched.

#### 2 · File and change list — exactly six files

| File | Change |
|---|---|
| `teacher-homework.html` | **NEW.** The staff surface. Root page, `noindex,nofollow`, no `nav.js`, *← Teaching* back link |
| `teacher.html` | **+2 lines.** `sideHomeworkLink` beside `sideExamsLink`, revealed on the existing no-role-test line |
| `nav.js` | **+2 keep-list entries.** `teacher-exams.html` and `teacher-homework.html` in `STAFF_NAV_KEEP` |
| `tests/teacher-homework-ui.test.mjs` | **NEW.** The contract suite for the page |
| `tests/staff-nav.test.mjs` | Keep-list restated to six; the reveal-then-filter order added as an executable regression |
| `CLAUDE.md`, `docs/roadmap/teacher-intelligence-layer.md` | Bookkeeping and this record |

No file under `supabase/` is touched. No frozen file is touched.

#### 3 · Page state matrix

`show()` over `loadingState | denyState | listState | paperState`, the
`teacher-exams.html` shape exactly.

| State | Entered when | Shows |
|---|---|---|
| `loadingState` | first paint | spinner card |
| `denyState` | no supabase client, RPC error, or **no ACTIVE staff row** | *This page is for teachers and their assistants* |
| (redirect) | no session | `location.href = 'login.html'` |
| `listState` | active staff | class picker, **+ New homework**, the paper tiles |
| `paperState` | a tile clicked, or a create | the eight cards below |

Inside `paperState`, per status:

| Card | draft | published | closed |
|---|---|---|---|
| Paper (title, instructions, Save, Delete) | editable; Delete shown | inputs disabled, Save disabled, Delete hidden | same as published |
| Schedule & answers (due Set/Clear, Reveal) | both live | both live | **due disabled** (`22023`); Reveal still live, per backend |
| Figures | full form + Edit/Delete | form hidden; previews only | form hidden; previews only |
| Questions | full form + ↑ ↓ Edit Delete | form hidden; read-only list **with the key**, staff-only | same as published |
| Publishing (hint, Publish, Close) | hint + Publish | Close only | **card hidden** |
| Code (Copy, Rotate) | **hidden** (decision 5) | shown, Rotate shown | shown, **Rotate hidden** |
| Students (roster) | hidden — nothing can attach to a draft | shown | shown |
| Review (one student) | hidden | shown once a student is picked | shown once picked |

#### 4 · RPC-to-UI action mapping — every call, and nothing else

**Reads (5).** `teacher_my_workspaces()` → the class picker, filtered to
`staff_status === 'active'`. `teacher_homework_list(p_workspace)` → the tiles
(title, status pill, question / attached / attempt / submitted counts, code
when not draft, due date). `teacher_homework_paper(p_homework)` → the whole
paper screen in **one** call: header, `can_edit_content`, `stimuli[]`,
`questions[]` (with `correct_answer` and `explanation`, which staff authored,
and never `media_sha256`). `teacher_homework_students(p_homework)` → the
roster. `teacher_homework_review(p_homework, p_student)` → the review card.

**Writes (13), all H3, all by `.rpc`.**

| UI action | RPC | Confirm |
|---|---|---|
| + New homework | `teacher_homework_create(p_workspace, 'Untitled homework')` | — |
| Save paper | `teacher_homework_update(p_homework, p_title, p_instructions)` | — |
| Set due / Clear due | `teacher_homework_set_due_at(p_homework, p_due_at\|null)` | — |
| Reveal answers | `teacher_homework_reveal_answers(p_homework)` | ✓ one-way |
| Add / Save figure | `teacher_homework_save_stimulus(…7 args)` | — |
| Delete figure | `teacher_homework_delete_stimulus(p_stimulus)` | — |
| Add / Save question | `teacher_homework_save_question(…9 args)` | — |
| Delete question | `teacher_homework_delete_question(p_question)` | — |
| ↑ / ↓ | `teacher_homework_reorder_questions(p_homework, p_question_ids)` — the **whole** id list | — |
| Publish | `teacher_homework_publish(p_homework)` | ✓ fixes the paper |
| Close | `teacher_homework_close(p_homework)` | ✓ |
| Rotate | `teacher_homework_rotate_code(p_homework)` | ✓ old code dies |
| Delete draft | `teacher_homework_delete(p_homework)` | ✓ |

Client-side form limits mirror the CHECK constraints: title 2–200,
instructions ≤ 4000, label ≤ 200, body ≤ 8000, prompt ≤ 8000, explanation
≤ 8000. The publish hint restates the live gate (≥ 1 question; ordinals 1..n
with no gaps). Every refusal is surfaced as `error.message`, verbatim.

#### 5 · The `nav.js` patch — the smallest one that fixes C-2

```
-  var STAFF_NAV_KEEP = { 'teacher.html': 1, 'partner.html': 1, 'profile.html': 1, 'settings.html': 1 };
+  var STAFF_NAV_KEEP = { 'teacher.html': 1, 'teacher-exams.html': 1,
+                         'teacher-homework.html': 1, 'partner.html': 1,
+                         'profile.html': 1, 'settings.html': 1 };
```

Two entries and a comment. Nothing else in `nav.js` changes: no new RPC, no
role read, no href rewrite, no element removed, and the filter still only ever
sets `display:'none'`. It stays correct in both directions because the filter
never un-hides: a link born `display:none` in the markup stays hidden until
`renderWorkspace()` reveals it, and the later filter passes now leave it alone
instead of hiding it again.

#### 6 · Test plan

**`tests/teacher-homework-ui.test.mjs`** — the contract, modelled on
`teacher-exam-ui.test.mjs`, every check written so it could go red:
provenance (every `.rpc` name defined by an applied homework migration; the
read set is exactly the five; **`.from(` count is 0**; no `.insert/.update/
.upsert/.delete(`); the gate (`staff_status === 'active'`, no `staff_role`, no
`isTeacher`, `denyState`, `login.html`, the link and its role-free reveal in
`teacher.html`); one renderer (`stimulus-view.js` loaded, `StimulusView.render`
used, no own `<svg`, all six kinds offered, SVG base64 + non-SVG refused);
status behaviour (editing shut after draft, code hidden while draft, rotate
only while published, publishing card hidden when closed, due disabled when
closed, roster hidden while draft); the five `confirm()` calls; reorder sends
the whole list; `esc()` defined and every author string escaped; the empty
sentences present; the head pins and `noindex`.

**`tests/staff-nav.test.mjs`** — keep-list restated to six (the deliberate
second opinion, still not read from `nav.js`), plus **the C-2 regression**: the
real `teacher.html` sidebar, parsed with its `style="display:none"` intact,
driven through the shipped filter in browser order — markup → filter → the
page's reveal → the +500 ms and +1500 ms passes — asserting both staff links
are still visible at the end. That test fails on today's `nav.js`.

Then: the full CI gate, the homework mutation suite over the new page checks,
and a report. **No deploy, no merge.**

### 15.30 · Teacher Homework H7 — the staff UI · BUILT, NOT DEPLOYED (2026-09-04)

The plan of §15.29, implemented. **Six files, no seventh.** No migration, no
table, no policy, no grant, no backend function, no change to any H1–H6
behaviour — `git diff HEAD -- supabase/` is **zero lines**, and production is
unchanged at 192 migrations with `20260904012019` (H6) still newest.
**Not merged and not deployed.**

#### What was built

| File | Change |
|---|---|
| `teacher-homework.html` | **NEW**, 913 lines. Four states, eight cards, 18 RPC calls, **zero table queries** |
| `teacher.html` | **+2 lines** — `sideHomeworkLink` beside `sideExamsLink`, revealed on the existing no-role-test line |
| `nav.js` | **+2 keep-list entries** and the comment that says why |
| `tests/teacher-homework-ui.test.mjs` | **NEW** — **160 checks** |
| `tests/staff-nav.test.mjs` | keep-list restated to six; **§7**, the reveal-then-filter regression (**56 checks**, was 47) |
| `CLAUDE.md` | the three stale rows corrected (below) |

#### The read boundary, as measured

The page calls **18 RPCs and nothing else** — the five reads decision 2 names
and the thirteen H3 writes. `.from(` appears **zero times** in the whole file,
including its comments: an earlier draft explained the rule using the literal
`.from()`, which would have forced the contract check to read prose, so the
sentence was rewritten. The contract asserts a **count of zero** rather than an
allow-list, because an allow-list quietly admits the next table added to it,
and it names each of the eight tables separately — `teacher_homework` above all,
whose `authenticated` SELECT grant still exists, so a direct read of it would
have *worked*.

`teacher_homework_paper()` fills the whole screen in one call, so no state
exists in which half a paper is on screen. Every write is followed by a
re-read (ten of them, counted exactly), so the screen always shows what the
database holds rather than what the client hoped.

#### Two defects found and fixed during the work

**The suite caught its own page.** The first draft built the list tile's meta
line by concatenating `h.homework_code` and escaping the joined result. That
is safe today — the code is server-generated from a 32-character alphabet —
but it escapes at the wrong place, and the rule the page is held to is *escape
at the point of interpolation*. Fixed: each fragment is escaped as it is
added, and the join is plain.

**Five mutants survived the first run, and each named a real gap.** A preview
that stopped typesetting maths; a figure label unescaped inside a `||`
fallback, which the direct-form regex could not see; a roster pill that
treated any attempt status as *submitted*, so an in-progress sitting would
have shown as handed in; a dropped re-read leaving a stale card; and a refusal
whose own words were replaced by *Something went wrong*. The assertions were
rewritten — a named-field escape table of fifteen entries, a slice of the
roster pill, an exact count of ten re-reads plus a per-function check, and an
exact count of sixteen verbatim refusals. **63 of 63 mutants killed** on the
re-run.

#### The `nav.js` fix, proven both ways

Two keep-list entries. The regression executes the shipped filter over
`teacher.html`'s **real** sidebar with the inline `style="display:none"`
preserved, in browser order: markup → filter → the page's reveal → the +500 ms
and +1500 ms passes. It asserts both staff links are still visible at the end,
and that the student destinations are still hidden, so the fix did not widen
the surface. **On the original `nav.js` it goes red** (two failures, measured
by reverting the patch and re-running); on the fixed one, green.

#### Behaviour the page carries

Draft: everything editable, publish with the live gate restated, delete.
Published: the code with Copy and Rotate, Close, the roster, review, due date,
reveal. Closed: read-only, **due date disabled** because `set_due_at` raises
`22023`, **reveal still available** because the RPC allows it in every status
and *close it, then show the answers* is the ordinary way to use it, rotate
gone. A draft's code is never printed — not on the paper screen and not in the
list. Editability comes from the server's `can_edit_content`, not from a
second copy of the rule here. After publish the figures and questions stay on
screen read-only, with the key visible, because staff wrote it and this is the
only place left to check it. The roster marks a student who is no longer in
the class, since a sitting stranded by removal otherwise looks identical to a
live one. The review renders **three** verdicts, never two: an omission is not
a wrong answer. Five `confirm()` gates, each proven to be the early return in
front of its own RPC, and saving, reordering and setting a due date ask
nothing.

#### Suites

| | |
|---|---|
| `teacher-homework-ui` | **163/163** |
| `staff-nav` | **56/56** (was 47) |
| `teacher-homework` (H1–H6 contract) | 486/486, unchanged |
| `teacher-access-scope` | 109/109, unchanged |
| Full CI | **67/67 green** (was 66) |
| Mutants | **66/66 killed** |

#### CLAUDE.md, corrected

The class-patterns card **is** deployed — `4e468d3` is on `main`, `teacher.html`
is byte-identical branch to `main`, and production deploy `7422cba` postdates
it. `ai-tutor` is at platform version **145**, sha `efedd0f8…`, not 144 /
`2c91aa15…`. A third Edge Function, **`support-actions`** (version 1, ACTIVE),
existed and had never been recorded. Nothing else in the documentation was
touched.

#### The pre-merge review, and the one defect it found

The page was driven in Chromium across every state — deny, empty list, draft,
figures, questions, reorder, publish, code, roster, review, due date, reveal,
rotate, close, refusal, delete — with the real file (only the four CDN tags
swapped for local stand-ins; everything from `<style>` onward byte-identical)
and a stub client whose `.from()` **throws and is recorded**. Result: **zero
table queries attempted**, all **18 RPCs exercised**, 0 unhandled, the five
`confirm()` texts captured, and the paper screen **byte-identical for a teacher
and an ACTIVE assistant**. The `nav.js` fix was confirmed in the browser too:
on the pre-fix keep-list both staff links read `hidden` at 2.4 s; on the fixed
one both are visible, with every student link still hidden.

**The visual review found one real defect the contract suite could not see.**
With a realistic roster the table was **1063 px against a 998 px container**, so
the Review button — the only action on the row — sat off the right edge **even
at 1440 px**, and clicking one scrolled the student names out of view. The
cause was a blanket `white-space:nowrap` on every roster cell. Fixed by letting
the two text columns wrap and keeping one line only where breaking would read
wrongly (state pills, submitted date, the button):

| width | before | after |
|---|---|---|
| 1440 / 1280 | 1063 px in 998 px, **clipped** | 998 px in 998 px, **clear** |
| 1024 | 1063 px in 942 px, clipped | 942 px in 942 px, **clear** |
| 820 | 325 px overflow | 65 px overflow, scrolls in its box |
| 390 | 755 px overflow | 495 px overflow, scrolls in its box |

The page never scrolled sideways at any width, before or after — `.tbl-wrap`
was doing its job; what was wrong was that the *action* was the thing outside
it. `nth-child` is positional, so the contract now pins the header row next to
the rule: insert or move a column and the suite goes red rather than putting
`nowrap` on the wrong cells. Three mutants cover it — the blanket rule
restored, the positions moved onto the columns that must wrap, and a column
inserted at the front.

#### What H7 did not do

No student UI, no dashboard card, no `exam.html` entry point, no Teacher Exams
change, no class-patterns change, no analyzer change, no SQL. **H8 is the
student surface and the unified *From your teachers* card.** Item I-2, the
Teacher Exams `select('*')` hardening, stays outside both.

---

### 15.31 · Teacher Homework H8 — the student surface · LIVE (2026-09-04)

**Merged and deployed 2026-09-04.** `main` = `3e45e4b`, Vercel production
`dpl_58baS9rsyeSu48LD8SH7NGmV1zbC` READY, and the served bytes verified
byte-identical on `www.si-math-ai.com` — `exam.html` md5 `17222b18…`,
`dashboard.html` `7bd3e37a…`, each ETag equal to the local file. The merge
tree was proved identical to the branch tree before the commit was made, and
CI was green on the merged tree before the push. **The homework vertical now
runs end to end from a teacher writing a paper to a student reading their
mark.**

H8 is the half of the homework vertical the student can see. Until it, a teacher
could author, publish and rotate a code, a student could be attached, and the
database would open, save, grade and read back a sitting — with **no client
anywhere in the repository** able to reach any of it.

**It added no schema, no RPC, no policy, no grant and no migration.** Every call
it makes is a function H4 and H5 installed and verified. The Phase 1 audit's
verdict was that no backend increment was required, and the build did not find
one: the six student contracts were sufficient exactly as written.

#### What shipped

| | |
|---|---|
| `exam.html` | the student player, extended with a third source |
| `dashboard.html` | one summary card, *From your teachers* |
| `tests/student-homework-ui.test.mjs` | **102 checks**, new |
| `tests/exam-page.test.mjs` | 4 assertions updated, 2 added |
| `tests/teacher-exam-student.test.mjs` | 1 assertion narrowed, 3 added |

The six RPCs, and nothing else: `student_my_homework`, `student_attach_homework`,
`student_homework_start`, `student_homework_paper`, `student_homework_save`,
`student_homework_submit`.

#### The decisions, as built

1. **`exam.html`, not a new page.** One player, three sources. The page's
   `<title>` and heading became *Exams & homework*, because a page that carries
   homework and calls itself Exams is telling the student something untrue.
2. **A separate homework player, not a mode inside the exam one.** `api.start`,
   `api.save` and `api.submit` already dispatch on `S.source`, and the temptation
   was to add a third branch. It was refused: the exam path is timed, records a
   visit and a per-item time delta, auto-submits on a clock and hands its result
   to the analyzer, and **none of those is true of homework**. Branching inside
   those functions would have left every one of those behaviours one condition
   away from a homework sitting. `hwRender`, `hwFlush`, `hwGo`, `hwChoose`,
   `hwDoSubmit`, `openHomework`, `openHomeworkReview` share no code path with
   the exam player — only `esc`, `math`, `say`, `show` and the renderer.
3. **Two groups under one heading**, *Homework* and *Exams*, with their own code
   boxes. They are kept apart because the boxes do different things: a homework
   code **attaches** the paper outright, an exam code only **raises a request**.
   A student who confused them would wait for an approval that never comes.
4. **The dashboard card is a summary and one door.** Counts of states only — no
   score, no mark, no question count, no paper title — and a single destination.
   It is loaded by its own function rather than inside `loadDashboard()`, so a
   failure leaves the dashboard exactly as it was instead of raising the page's
   error banner.

#### The invariant this increment exists to get right

**`attempt_status` is read before `can_open`, in both places that read them.**

`can_open` is the start-or-resume gate: `teacher_homework_can_open()` requires
`status = 'published'` and live membership in an active workspace, so it goes
false the moment a teacher closes the paper — which happens to **every** paper,
eventually — and the moment a student leaves the class. A submitted attempt is
finished work the student owns, and `student_homework_paper()`'s third gate arm
(F-1) serves it regardless. Reading `can_open` first would have hidden a
student's own marked homework the day their teacher closed it.

Both readers are ordered and asserted: `homeworkTile()` in `exam.html` and the
counting loop in `loadTeacherSummary()`. Both orders have a mutant.

The other half of the same rule: **the review calls `student_homework_paper()`
directly and never `student_homework_start()`.** A submitted attempt is not
startable, and the state in which the review matters most — a student removed
from the class after submitting — is exactly the state in which start refuses.

#### The analyzer boundary, drawn where it can be drawn

`exam.html` is the one page that loads `ExamMistakesLogger`,
`regenerateWeaknessReports` and `updateStreak`. The boundary is therefore inside
this file or nowhere. It is drawn as **unreachability, not a guard**: no
homework function names any of the three, none calls `finish()`, and `finish()`
is called from exactly two places, both of them exam paths. A mutant that adds
`if (S.source === 'homework') return;` **inside** `finish()` is killed on
purpose — a guard there would turn a claim that can be proved into one that
cannot.

Measured in a browser: a full homework sitting — start, answer, navigate, type,
submit — called all three **zero** times, with the three instrumented.

#### The answer key

The page gates the key on `answers_visible`, the flag the **server** computes,
and never on `reveal_answers`. The two are not the same: S-1 makes the flag
necessary but not sufficient, so a teacher who reveals mid-sitting hands nothing
to a student who can still change their answers. Where the caller is not
entitled, `correct_answer` is not selected at all, so there is nothing on the
page to hide. `reveal_answers` appears in `exam.html` **zero** times.

The verdict is three-valued and stays that way: `is_correct === true → Correct`,
`false → Wrong`, `answer == null → Left blank`. An unanswered question is never
a wrong one, on the page as in the database.

#### One defect found and fixed on the way past

**`S.source` could go stale.** Before H8 there was no screen a student could
return to the picker *from* — every exit off a sitting was a full navigation —
so a platform tile could rely on `S.source` still being `'platform'`. The
homework review has a *Back to homework* button, so it no longer can. Every
dispatch in `api.*` and in `finish()` tests for one value, which makes a stale
source harmless **today** and one added branch away from starting a platform
paper in another system's mode. `startPlatformSection()` now says it outright,
mirroring `startTeacherExam()`.

**A narrow-screen layout defect, measured not eyeballed.** At 390px the trailing
pills on a submitted row — LATE, SUBMITTED, Review — refused to shrink and drove
the title column to about 60px, one word per line, with the meta text running
under them. It affected the existing teacher-exam rows too. `.tile` now wraps and
the title column has a 12rem basis; above 640px nothing moves. Pinned by
measuring the rendered title width at three viewports, not by a screenshot.

#### Evidence

- **CI 69/69 green**, including the new suite.
- **`tests/student-homework-ui.test.mjs` — 102 checks**: the read boundary
  (`exam.html` reaches the database through `sb.rpc()` and **zero** `.from(`
  calls, and names no homework table at all), the analyzer boundary, both
  branch orders, the untimed guarantees, the six autosave triggers, the key,
  the two code boxes, the preview guards, and that the platform and
  teacher-exam functions know nothing about homework.
- **38 mutants, 35 killed and 3 equivalent mutants survived.** One equivalent
  mutant was replaced during the run: renaming a function *parameter* is killed,
  because the suite anchors on function headers — the pattern every page suite
  in this repo uses. Renaming a local inside a body survives, as it should.
- **71 browser checks in headless Chromium, 0 failures**, against a stubbed
  client whose `.from()` throws. Covered: the three tile states with a
  **closed** paper still offering Review; the sitting with **no clock**; a save
  carrying exactly `p_attempt`/`p_question`/`p_answer`; resume restoring the
  saved answers and **writing nothing back**; navigation with no change writing
  nothing; the confirm dismissed submitting nothing; a refused submit surfacing
  and leaving the answers intact; the review reached **without** a start call;
  the key shown and withheld; and the dashboard card's counts, its single
  destination and its absence for a student with nothing.
- Screenshots at 390 / 820 / 1280px for the picker, the review and the card.

**The smoke's first run found a defect in its own fixture, not in the page**: the
stub returned `is_correct: false` for an unanswered question, which the omission
CHECK on `teacher_homework_responses` makes impossible, and the page faithfully
rendered the impossible state as *Wrong*. The fixture now mirrors the server's
three-valued rule. This is the third time in this programme that a test, not the
code under test, was the thing that was wrong.

#### What H8 did not do

No schema, no RPC, no migration, no policy, no grant. No change to
`stimulus-view.js`, `teacher-exams.html`, `teacher-homework.html` or `nav.js`.
No teacher-facing change. No analyzer change. The two real production homework
drafts were not read, modified or attached, and neither rollback window was
consumed.

**Known and deliberately not fixed:** the code-box placeholders clip on a narrow
screen (`.codebox input` is uppercase with `.12em` letter-spacing), which the
exam box has always done and H8's box does identically. I-6 —
`teacher-exams.html` carrying 5 of the renderer's 33 `.sv-*` rules — is
untouched and stays a separate item; `exam.html` has all 33.

---

### 15.32 · I-6 · the renderer's stylesheet, and the test that could not see it (2026-09-04)

`stimulus-view.js` draws a stimulus and styles **nothing**: every colour, weight
and geometry constraint comes from CSS the page provides. That makes the
stylesheet part of the renderer's contract, and a page carrying a subset of it
does not draw a plainer figure — it draws a wrong one.

Three pages serve that stylesheet: `exam.html` (the student player, canonical),
`teacher-homework.html` and `teacher-exams.html` (the two staff previews).

#### What the audit measured, against the brief it was given

| | brief said | measured |
|---|---|---|
| classes the renderer emits | 33 | **30** — "33" was a *rule* count, and rules are not classes |
| `teacher-exams.html` | 5 of 33, 22 unstyled | 5 of 30, **25 unstyled** |
| `teacher-homework.html` | complete | **29/30 — missing `.sv`** |
| `exam.html` | complete | complete, 30/30 |

And the finding that changed the shape of the fix: **the six rules
`teacher-exams.html` did have DISAGREED with the canonical ones** rather than
being a subset of them — its `.sv-label` was 13px bold body text where the
canonical rule is 10.5px tracked mono, its `.sv-note` grey italics where the
canonical is an amber box. So this was a **replacement**, never an append.

#### It was broken, not cosmetic

Measured as computed styles in Chromium, rendering real `exam_stimuli` rows
under each page's verbatim stylesheet — **58 computed properties** differed:

- **plot — BROKEN.** `.sv-line`/`.sv-poly` carried no `fill:none`, so a curve
  **filled solid black**; `.sv-grid`/`.sv-axis` had no stroke, so there were no
  axes and no grid.
- **number_line — BROKEN.** `.sv-seg` had no stroke: the interval line was
  **invisible**, leaving unstroked dots floating.
- **figure — BROKEN.** `.sv-figure` sets the white card an author's black-ink
  SVG needs; without it the figure was near-invisible on the dark page.
- **chart — degraded.** Panels stacked instead of sitting side by side and the
  legend collapsed inline, running entries together.
- **table / text — cosmetic**, plus a wide table that could not scroll and a
  text stimulus that lost its authored line breaks.

**No stored content was affected, because there is none**: `teacher_exam_stimuli`
and `teacher_homework_stimuli` are both at 0 rows. The damage was entirely to
the authoring preview — which is the thing that decides whether a teacher saves
the question at all.

#### The test that let it happen

The parity check lived in `teacher-homework-ui.test.mjs` and derived its class
list with `/class="((?:sv-[a-z-]+\s*)+)"/`. That pattern needs a hyphen **and** a
closing quote immediately after, so it never saw four classes the renderer
really emits — `sv`, `sv-dash`, `sv-dot-off`, `sv-poly` — three of which the
renderer builds by concatenation (`class="sv-line' + dashed + '"`).

**`teacher-homework.html` shipped missing `.sv` with that suite green.** A guard
copied from it would have passed on a `teacher-exams.html` that still left
`sv-poly` and `sv-dash` unstyled.

`tests/renderer-css-parity.test.mjs` is now the single owner of the claim. It
derives from every `sv` token in the comment-stripped renderer, and then
**keeps the old pattern in the suite** to assert it saw only 26 and that the
four missing ones are exactly those four — so the fix cannot regress into the
bug. One mutant reverts the suite's own derivation, and is killed.

#### What changed

| file | change |
|---|---|
| `teacher-exams.html` | 6 divergent rules **replaced** by the canonical 34 |
| `teacher-homework.html` | `+1` line: the missing `.sv` rule |
| `tests/renderer-css-parity.test.mjs` | new, 78 checks |
| `tests/teacher-homework-ui.test.mjs` | the broken derivation removed |

All three pages now carry **34 rules, 30/30 classes, 2188 normalised bytes,
byte-identical after normalisation**. No renderer change, no schema, no RPC, no
permissions, no JS behaviour.

#### Evidence

- CI **70/70**; `renderer-css-parity` 78/78, `teacher-exam-ui` 48/48,
  `teacher-homework-ui` 186/186, and every H8 suite unchanged.
- **23 mutants, 20 killed, 3 equivalent survivors.** Four are named BLIND —
  dropping `.sv`, `.sv-poly`, `.sv-dash` or `.sv-dot-off` — because those are
  precisely what the old derivation could not see; all four are killed now.
- **84 browser checks at 390 / 820 / 1280px, 0 failures**: computed renderer
  properties identical across all three pages over 31 selectors, plus the eight
  breakages asserted on rendered geometry — curves not black, axes and grid
  visible, the number-line segment visible, the figure's white card measured
  200×90, chart panels sharing a row above 820px and wrapping cleanly below it,
  10px legend swatches, a wide table scrolling inside itself (2587px of content
  in 1213px), and a three-line text stimulus 65px tall.

**Three of those checks failed on the first run and all three were defects in
the harness, not the pages**: `.sv-note` is only emitted by an unplottable
curve so no element existed to measure; the wide-table probe read the *narrow*
table above it; and two chart panels legitimately wrap at 390px, so demanding
one row there asserted a bug rather than a contract. Fixed and re-measured.

#### Left open

The stylesheet is now triplicated and identical, guarded by a test rather than
by construction. A shared `assets/stimulus-view.css` would end the drift
permanently but adds a request and touches `exam.html`; recorded, not done.

---

## 16 · Figures & Data — the authoring problem, and the architecture that already exists

Audited 2026-09-04, read-only. Seven decisions locked the same day. **No file,
schema, policy, migration or renderer was changed by this work** — it is a
design record and a Stage 0 contract, nothing more.

### 16.1 · The finding that reframes the task

The Homework "Figures & Data" surface asks a teacher for `Spec (JSON)` in a
monospace textarea, or for an SVG file. That is unacceptable for teacher
authoring, and it was easy to assume the fix was a new structured-visual
architecture.

**It is not. The structured visual model already exists, and it is enforced in
the database.** What is wrong is that the authoring UI shows the teacher the
raw serialisation of a model that is already semantic.

| | measured 2026-09-04 |
|---|---|
| Storage | `kind` + `label` + `body` + `spec jsonb` + `media_ref/media_kind/media_sha256` |
| Kinds | `text` · `table` · `chart` · `plot` · `number_line` · `figure` |
| Shape rule | `exam_stimulus_shape_ok()` — mutually exclusive: text→`body`, four structured kinds→`spec`, figure→`media_ref` |
| Spec schema | `exam_stimulus_spec_ok()` — **4,632 characters of per-kind schema, enforced as a CHECK constraint**, with `exam_pie_panels_ok`, `exam_plot_figures_ok`, `exam_plot_frame_mode_ok` |
| Renderer | `stimulus-view.js`, 399 lines, `spec → SVG` at read time |
| Shared by | `exam_stimuli`, `teacher_exam_stimuli`, `teacher_homework_stimuli` — the teacher tables **call** the platform validators, they do not copy them |
| Consumers | `exam.html`, `teacher-exams.html`, `teacher-homework.html` |

**The live corpus:**

| table | rows | structured | figures / SVG | `display` used |
|---|---|---|---|---|
| `exam_stimuli` | **33** — 8 table, 6 chart, 15 plot, 4 number_line | **33** | **0** | 0 |
| `teacher_exam_stimuli` | **0** | — | — | — |
| `teacher_homework_stimuli` | **0** | — | — | — |

**SVG has never been used in production, and no teacher has ever authored a
stimulus.** There is nothing to migrate and nothing to break.

Four capabilities the brief assumed were missing already exist:

1. **SVG is already an internal output format.** The renderer generates it from
   the spec. `figure` is the escape hatch, and it is unused.
2. **`curves[].expr` is already valid in the database.** The schema accepts
   `{"expr": "x^2-4*x+3"}` as an alternative to `points`. The renderer declines
   to draw it and says so in the output. *Typing a function is a renderer gap,
   not a data-model gap.* 0 of 17 live curves use it.
3. **A stimulus is already shared across questions** — 43 questions reference
   33 distinct stimuli, up to 3 questions on one figure.
4. **`display` is already reserved** — the validator requires it to be an
   object if present, and nothing reads it. A designed extension slot, unused.

**The real gaps**, separated from the imagined ones: raster images cannot be
stored at all (`media_kind` is CHECK-constrained to `'svg'`); `media_ref` is
inline base64 in the row and is returned in every read payload, so it could
never carry a photograph; teacher questions have no `reading` / alt-text, while
`exam_questions.reading` plus `exam_stimulus_reading_still_valid()` enforce one
for the platform's own charts and graphs; and there is no `spec_version` and no
provenance field.

### 16.2 · The seven decisions, LOCKED

1. **Stage 0 is the next increment**: a teacher-friendly authoring UI for
   **Table, Graph/plot, Chart, Number line**. **Zero database, schema, policy,
   migration or renderer changes.**
2. **Raster images are NOT in Stage 0.** PNG/JPG/WEBP is **Stage 2**, together
   with the Storage and media-model work it genuinely requires.
3. **Accessibility is required, later.** Teacher `reading` / alt-text for
   charts and graphs is the additive accessibility stage, **Stage 3**.
4. **Expression curves use a deterministic, explicitly whitelisted grammar** —
   polynomials, standard mathematical functions, constants, operators,
   parentheses. **No arbitrary JavaScript, no `eval`, no unrestricted
   expression language.** The exact function list is an **open design item**
   (§16.6 O-1) to be settled before any expression renderer is written.
5. **Raw SVG stays** for backward compatibility and advanced users, behind an
   Advanced disclosure. **The normal teacher workflow must never require SVG,
   JSON, specification syntax or coding knowledge.**
6. **AI visual generation is Stage 4.** AI will emit validated structured
   specs, never raw SVG. Not now.
7. **Image → editable visual is Stage 4**, additive and non-destructive; the
   uploaded original is always preserved.

**Architecture decision: extend, do not replace.** The pipeline stays
`kind + validated spec JSONB → shared renderer → SVG output`. The teacher UI
becomes a visual editor over that model. **No parallel visual system.**

### 16.3 · The mechanism that makes Stage 0 possible — measured, not assumed

The requirement is that choosing *Graph* should feel like building a graph:

```
Graph
  Add function     y = x² - 4x + 3
  Add points       (2, -1)   (4, 3)
  X axis  -5 → 5
  Y axis  -5 → 10
  [Preview]
```

The obstacle looks fatal: the renderer does not draw `expr`, and Stage 0
forbids changing the renderer. It is not fatal, because of a property of the
live validator that was tested rather than assumed:

**A curve may carry BOTH `expr` and `points`.** The validator's rule is an
`OR`, so a curve holding the typed formula *and* its sampled points is valid;
and the renderer reads `points` first, so it draws the curve and never consults
`expr`. Verified against production with pure function calls:

| probe | `exam_stimulus_spec_ok('plot', …)` |
|---|---|
| curve with **both** `expr` and `points` | **true** |
| curve with `expr` only | true |
| function curve **+** a labelled points curve (the example above, exactly) | **true** |

And through the shipped `stimulus-view.js`, on that exact spec: a `sv-line`
polyline is drawn, both marked points render as circles, the labels A and B
appear, and **no** *"defined by a formula and is not drawn here"* note is
emitted. The contrast holds: `expr` with **no** points draws nothing and says
so.

So Stage 0's rule is:

> **The editor stores the teacher's meaning AND its drawing.** A function curve
> is saved as `{expr: "<the teacher's formula>", points: [<sampled>]}`. The
> formula is the record of intent, which Stage 1 will render directly; the
> points are what today's renderer draws. **Stage 0 never stores `expr` without
> `points`** — that is the one shape that would show a teacher an empty graph.

This is why Stage 0 needs no migration and no renderer change, and why the
teacher's typed formula is not thrown away.

### 16.4 · Stage 0 implementation contract

Four editors replacing the `Spec (JSON)` textarea in `teacher-homework.html`.
`text` keeps its plain textarea; `figure` moves behind **Advanced**, unchanged.

**Rules that bind every editor.** The UI emits a spec that
`exam_stimulus_spec_ok()` would accept, and validates before the round trip so
the teacher sees a sentence rather than a `23514`. It emits **no `display`
key** (Stage 3). It writes through `teacher_homework_save_stimulus()`
unchanged, with `p_spec` as the object. Preview is `window.StimulusView.render()`
and nothing else — **the only renderer entry point Stage 0 may call**; the
module exports `render`, `esc` and `KINDS`, and internal functions are not
reachable by design. Every teacher string reaches the DOM through the page's
`esc()`. Numbers are parsed once, at the edge, and a field that is not a number
is an error state, never a silent `0`.

**Round-trip safety — the rule that prevents data loss.** An editor hydrates
from the stored `spec`. If a stored spec contains anything the visual editor
cannot represent, the stimulus opens in the **Advanced JSON** editor with a
sentence saying why, and the visual editor is not offered for it. **The UI must
never load a spec partially and save it back with fields dropped.** In Stage 0
that means: a `plot` whose `figures[]` carry `closed`, `dashed` or `vertices`;
a `polygon` or `scatter` mode; a `frame` of `data`; or any key the editor does
not know.

---

#### Editor 1 · Table

- **Inputs.** A spreadsheet-like grid. Add / remove row, add / remove column,
  rename a column header inline, paste TSV from Excel or Sheets (first pasted
  row becomes headers when the grid is empty), an optional **note** under the
  table.
- **Validation.** ≥ 1 column and ≥ 1 row; every row has exactly as many cells
  as there are headers (enforced structurally by the grid, so it cannot be
  violated); every cell is stored as a **string** — the validator requires
  strings, so numeric input is stringified at the edge, never coerced to a
  number.
- **Canonical spec.** `{ "headers": [string…], "rows": [[string…]…] }`, plus
  `"note": string` when the field is non-empty.
- **Preview.** Live, through `StimulusView.render`, redrawn on blur of any
  cell — `renderTable` reuse, including its `sv-scroll` wrapper and `sv-cap`
  note.
- **Edit.** Hydrates from `spec.headers` / `spec.rows` / `spec.note`. Every
  table spec the schema permits is representable, so a table never falls back
  to Advanced.
- **Errors.** *"A table needs at least one column."* · *"A table needs at
  least one row."* · paste that yields ragged rows is padded to the header
  count and the padding is stated: *"Pasted 4 rows; two were short and have
  been padded with blanks."*
- **Empty.** A 2 × 2 grid with placeholder headers and a single hint line.

---

#### Editor 2 · Graph (plot) — the one that must not feel like a form

- **Inputs.**
  - **X axis** `from` → `to`, **Y axis** `from` → `to` (four numbers).
  - **Add function** → a text field prefixed `y =`, accepting the whitelisted
    grammar (§16.6 O-1). Optional per-function: dashed off (Stage 0 emits no
    `dashed`; see round-trip safety).
  - **Add points** → a repeatable row of `(x, y)` with an optional label per
    point, rendered as `(2, -1)` chips.
  - Optional **X label** / **Y label**.
  - **Preview** button and live redraw.
- **Validation.** `from < to` on both axes. A function must parse under the
  grammar of §16.7 and must produce **at least one drawable branch**, of which
  at least 2 samples fall **inside** the Y range — a visibility check, not a
  clip (§16.7.4) — otherwise it is refused with *"That function does not pass
  through the visible part of the graph. Widen the Y axis, or change the
  function."* A points group needs **at least 2 points** — not a UI preference
  but the live validator's rule, measured (§16.8 D-3); labels, when given, must
  be given for every point in that group (the validator ties label count to
  distinct vertices). At least one function or one points group must exist.
- **Canonical spec.**
  ```
  { "frame": "plane",
    "xRange": [x0, x1], "yRange": [y0, y1],
    "curves":  [ {"expr": "x^2-4*x+3", "points": [[x,y]…]},   // a function
                 {"points": [[2,-1],[4,3]]} ],                 // marked points
    "figures": [ {"mode": "curve"},
                 {"mode": "points", "labels": ["A","B"]} ] }
  ```
  `curves` and `figures` are **index-matched and equal in length** — the
  validator requires it. A function that breaks across a domain gap contributes
  **one curve per branch**, each with its own `{"mode":"curve"}` entry and each
  carrying the same `expr` (§16.7.4). `frame` is `plane` (axes cross at the origin), which
  is what a teacher means by "a graph"; `graph` and `data` frames are not
  offered in Stage 0 and force Advanced on load.
- **Sampling.** Fully specified in **§16.7.4**. A function is sampled at a
  fixed count across the X range and rounded to a fixed precision, so the same
  formula and the same ranges always produce byte-identical points —
  determinism is a property of the sampler, and the golden test pins it.
  Samples are **not** clipped to the Y range: a parabola that leaves the top of
  the frame should leave the top of the frame, and the SVG viewport clips it.
  Only a **domain error** removes a sample, and a run of removed samples
  **splits the function into separate curves** — which is how a segment break
  is expressed without touching the renderer.
- **Preview.** `renderPlot` reuse, unchanged.
- **Edit.** A curve with `expr` loads its formula into the function field; a
  curve with only `points` loads into the points editor; `labels` load onto the
  points. Anything else → Advanced, per the round-trip rule.
- **Errors.** *"The X axis must run from a smaller number to a larger one."* ·
  *"`sin x` is not one of the functions this editor understands."* (naming the
  token) · *"A graph needs at least one function or one point."*
- **Empty.** Axes pre-filled `-5 → 5` and `-5 → 5`, one empty function row, and
  the hint *"Type a function like `x^2 - 4x + 3`, or add points."*

---

#### Editor 3 · Chart

- **Inputs.** Type: **Bar**, **Line**, **Pie**. Bar/line: a category column
  plus one column per series, each series named; add / remove category, add /
  remove series; optional X and Y labels. Pie: 1–3 panels, each with 2–4
  category/value pairs and an optional panel title.
- **Validation.** Bar/line: ≥ 1 category, ≥ 1 series, every series has exactly
  one numeric value per category (structural), all values numbers. Pie: values
  ≥ 0, each panel's values **sum > 0**, 2–4 categories per panel, 1–3 panels,
  and the spec carries **none** of `categories` / `series` / `xLabel` /
  `yLabel` — the validator refuses a pie that does.
- **Canonical spec.** Bar/line
  `{ "chartType": "bar"|"line", "categories": [string…], "series": [{"name": string, "values": [number…]}…] }`
  plus `xLabel` / `yLabel` when set. Pie
  `{ "chartType": "pie", "panels": [{"categories": [string…], "values": [number…], "title"?: string}…] }`.
- **Preview.** `renderBarOrLine` / `renderPie` reuse, chosen by `chartType`
  exactly as `render()` does.
- **Edit.** Fully representable both ways; charts never fall back to Advanced.
- **Errors.** *"Every value must be a number."* naming the cell · *"A pie chart
  needs between 2 and 4 slices in each panel."* · *"A pie panel's values cannot
  all be zero."*
- **Empty.** Bar, 3 categories, 1 series named "Series 1", all values blank.

---

#### Editor 4 · Number line

- **Inputs.** **From** / **To**; **Add point** (a number, repeatable); **Add
  interval** with `from`, `to` and two toggles rendered as *included* ● /
  *excluded* ○ rather than as the field names `fromClosed` / `toClosed`.
- **Validation.** `min < max`; **at least one point or one interval** — the
  validator refuses a number line with neither; every endpoint a number.
  Intervals outside `[min, max]` are refused with the range named.
- **Canonical spec.**
  `{ "min": n, "max": n, "points": [n…], "segments": [{"from": n, "to": n, "fromClosed": bool, "toClosed": bool}…] }`
  — each array omitted when empty.
- **Preview.** `renderNumberLine` reuse. The filled/hollow endpoint is the
  whole question in most number-line items, so the toggle previews live.
- **Edit.** Fully representable; never falls back.
- **Errors.** *"A number line needs at least one point or one interval."* ·
  *"From must be smaller than To."*
- **Empty.** `-5 → 5`, one empty point row.

---

#### Shared stimuli — unchanged, and finally visible

The mechanism does not change: a question references a stimulus by
`stimulus_id`, several questions may reference one, and the question form's
**Figure** dropdown already offers every stimulus of the homework. What Stage 0
adds is honesty about it — each stimulus row shows **"used by N questions"**,
and editing one used by more than one question says so before saving:
*"This figure is used by 3 questions. Changing it changes all of them."* No
schema, no RPC, no policy change; the count comes from the `questions[]` array
`teacher_homework_paper()` already returns.

#### Renderer reuse — the complete list

`window.StimulusView.render(stimulus)` and `window.StimulusView.KINDS`.
Nothing else. The editors must not reimplement `renderTable`, `renderPlot`,
`renderBarOrLine`, `renderPie` or `renderNumberLine`, and cannot: they are
private to the module. Preview is therefore the same code path a student runs,
which is the property that makes preview meaningful.

### 16.5 · Tests Stage 0 must ship

Following the repository's established pattern — the builder logic is a **pure
function lifted out of the page** and executed in Node, exactly as the
class-patterns rule was:

1. **`tests/stimulus-editor.test.mjs`** — for each of the four editors:
   inputs → canonical spec, asserted field by field; the four validation
   refusals per editor with their exact sentences; the round-trip law
   `hydrate(emit(inputs)) === inputs` on a representative set; and the
   fall-back-to-Advanced rule fired by each unrepresentable shape
   (`closed` / `dashed` / `vertices` / `polygon` / `scatter` / `frame:"data"` /
   an unknown key).
2. **The `expr` + `points` law** — asserted directly: every function curve the
   graph editor emits carries **both**, and a mutant that emits `expr` alone is
   killed.
3. **Golden renders** — each canonical spec through the real
   `stimulus-view.js`, asserting the drawn features (a `sv-line` polyline for a
   function, one circle per marked point, the labels, and **the absence** of
   the *"defined by a formula"* note) plus a hash of the SVG so an accidental
   renderer change is visible.
4. **Sampler determinism** — the same formula and ranges produce byte-identical
   points across runs.
5. **A production read-only dry-run** as an acceptance step: every generated
   fixture passed to `exam_stimulus_spec_ok()` on the live database and
   required to return `true`. Pure function calls, no writes, no transaction
   that could leave anything behind.
6. **`teacher-homework-ui` extensions** — no `.from(` still 0; the RPC set
   still exactly 18; the JSON textarea no longer on the normal path; Advanced
   still reachable; `StimulusView.render` still the only preview.
7. **Mutation testing** to the standard of the H4–H7 suites.

### 16.6 · Open design items, and what Stage 0 is not

- **O-1 · The whitelisted function list.** Decision 4 fixes the shape of the
  grammar but not its contents. To be settled, explicitly, before any
  expression code is written: which of `sqrt` `abs` `sin` `cos` `tan` `log`
  `ln` `exp` `min` `max` `floor` `ceil` are in; whether `^` means power;
  whether implicit multiplication (`2x`, `4x^2`) is accepted; how `π` and `e`
  are written; and what a division by zero or a domain error does to a sample
  (proposal: that sample is dropped, not zeroed). **The parser is a total
  function over a fixed token set — never `eval`, never `Function`.**
- **O-2 · CLOSED by §16.7.4** — 201 samples, 4 decimal places, at most 8
  branches per function, at least 2 points per branch.
- **O-3.** Whether Stage 0 offers `dashed`, and so whether it may emit a
  `figures[]` key beyond `mode` and `labels`. Proposal: **no** — it keeps the
  round-trip law simple and Stage 3 can add it with `display`.

**Stage 0 does not**: change the database, any policy, any grant, any RPC, the
renderer, Teacher Exams, the student player, or the analyzer. It does not add
raster images (Stage 2), `reading` / alt-text (Stage 3), expression rendering
(Stage 1), AI generation or image→editable (Stage 4). It does not remove raw
SVG — it moves it behind Advanced, where a teacher who does not want it will
never meet it.

### 16.7 · Stage 0 expression grammar — LOCKED (O-1 closed, 2026-09-04)

Conservative on purpose. The four functions a teacher actually reaches for —
`x^2 - 4*x + 3`, `sqrt(x + 2)`, `sin(x)`, `2*x + 5` — must all work, and
nothing beyond the list below is admitted. The parser is a **total
deterministic function over a fixed token set**: never `eval`, never
`Function`, never an expression engine.

#### 16.7.1 · The grammar

**Variable** — `x`, and nothing else. No parameters, no second variable.

**Numeric constants** — integers (`3`), decimals (`0.5`, `.5`, `2.`), and
**scientific notation** (`1e3`, `2.5e-4`). Named constants **`pi`** and **`e`**.

> Scientific notation and the constant `e` collide, so the tokenizer's rule is
> stated rather than left to chance: a number token is read **greedily from a
> digit or a leading `.`**, and an `e` immediately following the digits, with
> an optional `+`/`-` and **at least one digit**, is part of that number.
> Everywhere else `e` is the constant. So `1e3` is one thousand, `e` is
> 2.718…, `e^2` is the constant squared, and `2e` is a **parse error** — not
> `2*e`, because implicit multiplication does not exist here. Deterministic,
> and no input silently means two things.

**Operators**, with the only precedence table Stage 0 has:

| level | operators | associativity |
|---|---|---|
| 1 (loosest) | `+` `-` (binary) | left |
| 2 | `*` `/` | left |
| 3 | unary `-` (and unary `+`) | right |
| 4 (tightest) | `^` | **right** |

So `-x^2` is `-(x^2)`, and `2^3^2` is `2^(3^2) = 512`. The right operand of
`^` may itself be unary, so `2^-3` parses as `2^(-3)`. All three are the
conventional mathematical reading, and all three are pinned by a test.

**Grouping** — `(` … `)`. Nothing else groups.

**Functions**, exactly eight, each taking exactly one argument in parentheses:
`sqrt` · `abs` · `sin` · `cos` · `tan` · `exp` · `ln` · `log`.

- `ln` is the natural logarithm; `log` is **base 10**. Stated because the two
  conventions differ by country and a silent choice here is a wrong graph.
- `sin` / `cos` / `tan` take **radians**.
- A function name must be followed by `(`. `sin x` is a parse error naming the
  token, never an implicit application.

**No implicit multiplication.** `2*x` not `2x`; `2*(x+1)` not `2(x+1)`;
`x*(x+1)` not `x(x+1)`. This is a deliberate Stage 0 boundary: implicit
multiplication needs extra grammar and several normalisation judgements
(`e*x` vs `ex`, `pi*x` vs a name `pix`) and buys nothing Stage 0 needs. The
error message teaches the fix: *"Write `2*x` rather than `2x` — this editor
needs the multiplication sign."*

#### 16.7.2 · Normalisation, and what gets stored

Teachers paste from books, Word and WhatsApp, so the input is normalised
**before** parsing. The rules are total and ordered:

1. Trim, and collapse every Unicode space (including U+00A0) to a single ASCII
   space.
2. Strip a leading `y =`, `y=`, `f(x) =` or `f(x)=`.
3. Superscript digits → `^`: `x²` → `x^2`, `x³` → `x^3`, and so on for
   `⁰¹²³⁴⁵⁶⁷⁸⁹`. Consecutive superscripts fold into one exponent (`x¹²` →
   `x^12`).
4. Unicode operators → ASCII: `−` (U+2212) → `-`, `×` and `·` → `*`, `÷` → `/`,
   `–`/`—` → `-`.
5. `π` → `pi`, `√(` → `sqrt(`.
6. **Lower-case the entire string.** Safe because every token in the grammar is
   lower-case ASCII and `x` is the only variable, so `X`, `SIN(` and `1E3` all
   normalise correctly and nothing else in the language is case-sensitive.

**Normalisation is a total rewriting function and never raises.** Anything it
cannot rewrite — a bare `√` not followed by `(`, a stray `∫`, a second
variable — simply survives it and is rejected by the tokenizer as an unknown
token, with one error path rather than two. (`√x+1` is genuinely ambiguous, so
a bare `√` is meant to fail; it fails *there*.)

**The stored `expr` is the normalised string** — not a re-serialised AST. A
re-serialisation would rewrite the teacher's formula back at them (`x^2 - 4*x +
3` returned as `((x^2)-(4*x))+3`) for no gain: determinism only requires that
the same input always yields the same stored string, which normalisation
already guarantees. The invariant that matters is pinned by a test instead:

> **`expr` must always re-parse to the same AST that produced the points.**

#### 16.7.3 · Domain and error behaviour

A sample is **invalid** — it produces no point — when evaluation yields
division by zero, `sqrt` of a negative, `ln`/`log` of a non-positive, or any
non-finite result (`NaN`, `±Infinity`), by whatever route. No substitution, no
zero, no clamp: the sampler never invents a point.

> **`tan` is not in that list, and the reason is measured.** A pole of `tan`
> is unreachable in double precision on this grid — over `[-5, 5]` at 201
> samples **0 values are non-finite** and the largest is `8.07e+1`. `tan`'s
> poles are therefore caught by the Y-delta split of §16.7.4 and **never** by
> this finiteness check. An earlier draft of this section claimed otherwise;
> it was wrong, and a test written from it could only ever have gone red.

Overflow counts as non-finite, so an intermediate that overflows to `Infinity`
invalidates its sample rather than drawing a spike to the horizon.

#### 16.7.4 · Sampling, branching, and how a break is expressed (O-2 closed)

| constant | value | why |
|---|---|---|
| samples | **201** across `[x0, x1]` | dx = span/200; smooth at the sizes teachers use, ~4 KB of JSONB per function |
| precision | **4 decimal places** | fixes the golden hashes; below visual resolution at every frame size |
| max branches | **8** per function | `tan` over a wide range would otherwise produce dozens of curves |
| min points per branch | **2** | the validator refuses `points` shorter than 2 |

**The branch rule, which is how the segment break is achieved without touching
the renderer.** `renderPlot` draws each curve's points as one `<polyline>`, and
neither the schema nor the renderer has a break token — so a break becomes a
**new curve**:

1. Sample the normalised expression at the 201 x-values.
2. Split the run wherever a sample is invalid (§16.7.3), **or** where the
   change in y between consecutive valid samples exceeds the full height of the
   Y range. That second clause is the one heuristic in Stage 0 and it exists
   for a measured reason: without it `tan(x)` and `1/x` draw a full-height
   vertical line straight through the asymptote, which reads as a continuous
   function and is simply a wrong graph. Its worst failure is cosmetic — a
   genuinely steep curve is split into two polylines that abut — and the
   constant is one number in one place.
3. Discard any run shorter than 2 points.
4. Emit **one curve per surviving run**, each `{"expr": <normalised>, "points":
   [...]}` and each with its own `{"mode": "curve"}` in `figures`.
5. If nothing survives, refuse the function: *"This function has no drawable
   part in the range you set."*
6. If more than 8 branches survive, keep the first 8 and say so: *"This
   function breaks into more than 8 pieces in this range. Showing the first 8 —
   narrowing the X axis will show it properly."*

**Samples are not clipped to the Y range.** A parabola that leaves the top of
the frame leaves the top of the frame; the SVG viewport clips it, which is what
a real graph looks like. The Y range is used only for the **visibility check**
(§16.4) and for the branch heuristic above.

#### 16.7.5 · The Stage 0 storage law

> **Every function curve stores `expr` AND its sampled `points`.**
> `expr` preserves the mathematical meaning, for Stage 1 to render directly;
> `points` are the Stage 0 drawing. **Stage 0 must never save an `expr`
> without valid drawing points** — that is the one shape the live renderer
> answers with *"defined by a formula and is not drawn here"*, which would show
> a teacher an empty graph.

Enforced in three places: the builder refuses to emit it, a contract assertion
requires every emitted function curve to carry both keys, and a mutant that
drops `points` is required to be killed.

#### 16.7.6 · Explicitly out of Stage 0

Not admitted, and not to be added quietly: implicit multiplication · any named
function outside the eight · derivatives and integrals · piecewise syntax ·
inequalities · any parameter other than `x` · complex numbers · constants
beyond `pi` and `e` · user-defined functions · equations solved for something
other than `y` · units. Each is a future extension on its own evidence, and
none is a Stage 0 defect.

#### 16.7.7 · What the grammar adds to the test plan

On top of §16.5: a **token-and-AST table** — every accepted token, and the two
precedence readings (`-x^2` = `-(x^2)`, `2^3^2` = 512); the six normalisation
rules, each with an input that only that rule fixes; the `1e3` / `e` / `e^2` /
`2e` tokenizer table; every rejection with the exact sentence, `2x` and `sin x`
included; a **domain table** — `1/x`, `sqrt(x+2)`, `ln(x)`, `tan(x)` over
`[-5,5]`, asserting branch counts and that no branch is shorter than 2 points;
the **no-invented-points law** (an invalid sample never becomes `0`); the
**re-parse invariant** (`parse(stored_expr)` equals the AST that produced the
points); byte-identical output across runs; and a **grammar-closure test** —
`eval`, `Function`, `new Function`, `setTimeout` and `constructor` appear
nowhere in the parser, and an input containing them is a parse error like any
other unknown token.

#### 16.7.8 · One item this opens

- **O-4 · CLOSED by §16.7.11** (2026-09-05) — Stage 1 groups `curves[]` into
  functions by **adjacency, never globally**, which is the rule Stage 0's
  `hydratePlot` already ships. A function that breaks stores the same `expr` on
  each branch, which is the honest statement — every branch *is* that function
  on part of its domain. When Stage 1 renders from `expr` directly it must
  treat consecutive curves sharing an identical `expr` as one function, or it
  will draw it several times. Recorded here before Stage 1 so it was not
  discovered during it.

### 16.7.9 · The pinned branch fixtures (clarification 1)

A branch count means nothing without the parameters that produce it, so every
fixture below pins **expression, X range, Y range, sample count (201) and
precision (4 dp)**, and asserts the exact count. These numbers were **derived
by executing §16.7.4 as written**, not estimated; a test may assert them
literally.

| # | `expr` | X range | Y range | invalid samples | runs | 1-point runs discarded | **branches stored** | branch sizes |
|---|---|---|---|---|---|---|---|---|
| F1 | `x^2-4*x+3` | `[-5, 5]` | `[-5, 10]` | 0 | 1 | 0 | **1** | `[201]` |
| F2 | `2*x+5` | `[-5, 5]` | `[-5, 10]` | 0 | 1 | 0 | **1** | `[201]` |
| F3 | `sin(x)` | `[-5, 5]` | `[-5, 5]` | 0 | 1 | 0 | **1** | `[201]` |
| F4 | `sqrt(x+2)` | `[-5, 5]` | `[-5, 10]` | 60 | 1 | 0 | **1** | `[141]` |
| F5 | `ln(x)` | `[-5, 5]` | `[-5, 5]` | 101 | 1 | 0 | **1** | `[100]` |
| F6 | `1/x` | `[-5, 5]` | `[-5, 5]` | 1 | 2 | 0 | **2** | `[100, 100]` |
| F7 | `tan(x)` | `[-5, 5]` | `[-5, 5]` | 0 | 13 | **8** | **5** | `[5, 61, 61, 61, 5]` |
| F8 | `tan(x)` | `[-20, 20]` | `[-5, 5]` | 0 | 21 | 8 | 13 → **capped to 8** | cap message fires |

Each fixture earns its place:

- **F1–F3** are the everyday case: one branch, every sample valid.
- **F4** is a domain boundary that does **not** break the curve — `x < -2` is
  simply absent, and the branch starts at `x = -2`. One branch, 141 points.
- **F5** is a one-sided domain: 101 invalid samples, still one branch.
- **F6** splits on the **domain rule** (`1/0` is non-finite). The Y-delta rule
  would also have split it — `|Δ| = 40` against a span of `10` — so the two
  mechanisms agree, and a test that removed either would still pass. **F7 is
  therefore the fixture that isolates the heuristic**, because there the
  finiteness check catches nothing at all.
- **F7** is the min-2 rule's proof (below) and the heuristic's only isolated
  evidence: 4 poles → 5 branches, via 13 runs of which 8 are discarded.
- **F8** is the only fixture that fires the 8-branch cap and its message.

If any constant in §16.7.4 changes, **every number in this table changes with
it** — which is the point of pinning them together.

### 16.7.10 · The minimum-2-point rule, stated exactly (clarification 2)

1. A contiguous run of valid samples becomes a stored curve **only when it
   contains at least 2 valid samples**.
2. A run containing **exactly 1** valid sample is **discarded**.
3. The sampler must **never invent, duplicate, extrapolate, mirror,
   interpolate or otherwise synthesise a point** in order to reach the
   two-point minimum. A run that cannot reach it on real samples alone does
   not become a curve.
4. Therefore **every coordinate in every stored `curves[].points` is an actual
   sample produced by the deterministic evaluator** at one of the 201 grid
   x-values, rounded once to 4 decimal places.

The rule is not decoration: **F7 discards 8 single-point runs** — the samples
immediately beside each `tan` pole, each isolated between two over-height
deltas — and stores 5 branches from the 13 runs. A build that "rescued" those
8 by duplicating a coordinate would store 13 curves, 8 of them a degenerate
two-identical-points polyline drawn as a dot at an asymptote: a mark on the
graph that no sample supports. The mutant that does exactly that must be
killed.

The minimum is also the database's: `exam_stimulus_spec_ok` requires
`jsonb_array_length(points) >= 2`, so a 1-point curve is not merely discouraged
— it cannot be stored.

The Y-delta split heuristic of §16.7.4 is **unchanged** by this clarification.

### 16.7.11 · O-4 CLOSED — Stage 1 expression-rendering function identity (2026-09-05)

Read-only audit, then a decision. No code was written, no schema proposed, and
Stage 0 was not touched. The audit's finding is the whole of the answer:
**Stage 0 already implements this rule**, so Stage 1 does not get to choose one.

#### The rule, LOCKED

> **O-4 (CLOSED).** Stage 1 groups a plot's `curves[]` into functions by
> **adjacency, never globally**.
>
> 1. Walk `curves[]` in **stored order**, tracking the previous curve's `expr`.
> 2. Consecutive curves with the **same `expr`** are **branches of one
>    function** — rendered once, as one function, across all its branches.
> 3. A **different `expr`** ends the current run.
> 4. A **points curve** (no `expr`) ends the current run **and resets the
>    tracker**.
> 5. **Non-consecutive identical expressions are separate functions.**
>    `1/x, x^2, 1/x` is three functions, not two.
> 6. A **single `expr` curve is one function** — the general rule at N = 1, not
>    a special case.
> 7. **Adjacent duplicate expressions are intentionally normalised as one
>    function**, because the current model has no grouping key and the two are
>    visually identical. The collapse is normalisation, not loss.

**The storage law of §16.7.5 is preserved unchanged.** A function curve stores
**both** `expr` and `points`. Stage 1 renders from `expr`; `points` stay the
answer for any renderer that does not evaluate one — which is the live one
today. O-4 adds **no function id, no branch id, no grouping key, no schema
field and no new visual architecture**.

**The invariant this establishes:** *Stage 1 renderer function identity must
agree with `hydratePlot` function identity.* Both sides answer "how many
functions is this?", and they must answer identically or a teacher edits two
rows and sees three curves.

#### Why adjacency, and why this exact rule

`stimulus-editor.js:474-491` has shipped the rule since Stage 0, and says so
in its own comment: *"Consecutive curves sharing one expr are BRANCHES OF ONE
FUNCTION and must fold back into a single row, or the round trip would multiply
the function by its own branch count."* The audit **executed the shipped
`hydrate('plot', …)`** rather than reading it — every row below is a measured
result, re-measured 2026-09-05:

| stored `curves[]` | `inputs.functions` | functions | pointGroups |
|---|---|---|---|
| one `x^2` | `["x^2"]` | **1** | 0 |
| `1/x`, `1/x` | `["1/x"]` | **1** | 0 |
| `tan(x)` ×5 | `["tan(x)"]` | **1** | 0 |
| `1/x`, `x^2`, `1/x` | `["1/x","x^2","1/x"]` | **3** | 0 |
| `1/x`, points, `1/x` | `["1/x","1/x"]` | **2** | 1 |
| `x^2`, `2*x` | `["x^2","2*x"]` | **2** | 0 |
| points only | `[]` | **0** | 1 |

Three reasons this rule and no other:

- **Adjacency is the only rule the stored model can express.** `figures[]`
  carries `mode` (plus `labels` on a points curve) and nothing else — no
  function id, no branch index. Inventing a grouping key means a schema field,
  which §16.2's *extend, do not replace* forbids and which the roadmap does not
  authorise for Stage 1.
- **Global grouping would change what a teacher already sees.** It would merge
  `1/x, x^2, 1/x` into two functions and reorder the drawing, for a spec that
  renders correctly today.
- **Divergence would split the editor from the renderer.** If Stage 1 grouped
  differently, `hydratePlot` would have to change with it — a Stage 0 change
  carrying its own round-trip risk, not something to slip into Stage 1.

One consequence stated plainly rather than left implicit: **the model does not
distinguish two genuinely separate functions that share an `expr` when they are
adjacent.** Two such curves sample identically and draw exactly on top of each
other, so the collapse loses nothing visible — but it is a real limit of the
model, not an oversight, and rule 7 records it as a decision.

#### The seven test obligations

Stage 1 reuses the **pinned fixtures of §16.7.9** — F6 (`1/x` → 2 branches) and
F7 (`tan(x)` → 5) — and introduces **no new sampling constant**.

1. **F6 renders one function from two branches; F7 renders one from five.**
2. **Branch geometry stays separate.** N branches still draw **N polylines**,
   one per branch. Grouping is about *function identity*, never merging
   geometry — this is the assertion that stops a naive fix from joining two
   branches across an asymptote. `tests/stimulus-editor.test.mjs:419` already
   pins the Stage 0 half of it.
3. **Non-consecutive identical expressions:** `1/x, x^2, 1/x` → **three**
   functions, in stored order.
4. **A points curve resets adjacency:** `1/x`, points curve, `1/x` → **two**
   functions.
5. **Consecutive identical expressions collapse:** two adjacent identical
   `expr` → **one** function.
6. **A single `expr` curve → one function.**
7. **The agreement test, and it is the important one.** For every fixture, the
   renderer's function count **equals**
   `hydrate('plot', spec).inputs.functions.length`. Both sides are computed
   from the shipped code, so a future change to either that breaks the
   correspondence goes red rather than going unnoticed.

**Mutants that must be killed:** global grouping instead of adjacency (killed
by 3); a points curve that does not reset the run (killed by 4); branches
merged into a single polyline (killed by 2); the adjacency comparison made
non-strict (killed by 5 or 7).

O-4 is closed. **Nothing else about Stage 1 is defined by it** — not the
renderer, not the evaluator, not the Stage 1 goal or exit criteria.

### 16.8 · Line-by-line contract review (2026-09-04)

Read-only. Five checks, three defects found and corrected in place, one
limitation surfaced. Nothing outside `docs/` was touched.

**Check 1 · §16.4 agrees with §16.7.** After correction, yes. §16.4's sampling
paragraph now defers to §16.7.4 rather than restating it, its canonical-spec
block names the one-curve-per-branch rule, and its validation line separates
the two different "2"s that previously collided in one sentence — the
**visibility** check (at least 2 samples inside the Y range) and the
**min-2-points-per-branch** rule are different rules about different things.

**Check 2 · the `expr + points` invariant is consistent everywhere.** Stated in
§16.3, shown in §16.4's canonical spec, emitted per branch by §16.7.4 step 4,
and restated as law with three enforcement points in §16.7.5. No section
permits `expr` alone. §16.7.10 point 4 closes the other side: no point exists
that a sample did not produce.

**Check 3 · the segment-break representation is consistent with the live
validator and the shipped renderer.** Verified, not reasoned:

| probe | result |
|---|---|
| two curves carrying the **same** `expr`, two `{"mode":"curve"}` figures → `exam_stimulus_spec_ok` | **true** |
| the same spec through `stimulus-view.js` | **2 polylines**, no line across the gap, no *"defined by a formula"* note |

The `figures[]` entries Stage 0 emits carry `mode` only, which satisfies
`exam_plot_figures_ok`'s closed key-set; `exam_plot_frame_mode_ok('plane',
'curve')` is true; and `renderPlot` reads `figures[i] || {}` and defaults the
mode, so an index-matched pair is exactly what it expects.

**Check 4 · normalisation, precedence and tokenisation do not contradict.**
Two contradictions were found and fixed. Normalisation was described as a
*total* function while rule 5 *raised* on a bare `√` — it is now purely a
rewriter, and anything it cannot rewrite falls through to the tokenizer's one
rejection path. Rule 6 said "lower-case the function and constant names …
leaving nothing else case-sensitive", which is two rules pretending to be one;
it now lower-cases the whole string, which is safe because every token in the
grammar is lower-case ASCII and also makes `X` and `1E3` normalise correctly.
The `^` right-operand case (`2^-3`) is now stated. The `e` / `1e3` tokenizer
rule and the no-implicit-multiplication rule agree: `2e` is a parse error under
both, never `2*e`.

**Check 5 · no Stage 0 requirement needs a renderer or database change.**
Walked item by item: the four editors emit specs the live CHECK already
accepts; multi-branch functions are validated and drawn today (Check 3); the
"used by N questions" count comes from the `questions[]` array
`teacher_homework_paper()` already returns; Advanced JSON and raw SVG use
`teacher_homework_save_stimulus`'s existing `p_spec` and `p_media_ref`; preview
is `StimulusView.render`. **Zero renderer changes, zero schema changes, zero
RPC changes, zero policy changes.**

#### The three defects, and one limitation

- **D-1 · normalisation contradicted itself** — "total function" vs a raising
  rule. Fixed (Check 4).
- **D-2 · §16.7.3 was factually wrong about `tan`.** It listed "tan at a pole"
  as a domain error. Measured: over `[-5, 5]` at 201 samples, **0** `tan`
  values are non-finite and the largest is `8.07e+1`. `tan`'s poles are caught
  by the Y-delta heuristic and never by the finiteness check. A test written
  from the old sentence could only ever have failed. Corrected, with the
  measurement recorded beside it.
- **D-3 · §16.4 permitted a 1-point points group; the database refuses it.**
  Measured against the live validator: a curve with `points` of length 1 →
  `exam_stimulus_spec_ok` = **false**; length 2 → **true**. Corrected to "at
  least 2 points", and the reason is now attributed to the validator rather
  than to taste.
- **L-1 · a teacher cannot mark a single point on a graph in Stage 0.** This
  falls out of D-3 and is a genuine product limitation, not a bug:
  `jsonb_array_length(points) >= 2` is a live CHECK constraint shared with the
  33-row platform corpus, so relaxing it is a **schema change** and therefore
  out of Stage 0 by decision 1. Stage 0 must say so in the UI — *"Mark at
  least two points, or use a function."* Relaxing the minimum to 1 for a
  `points`-mode curve is recorded as a **Stage 3** candidate; it must be proven
  additive against the existing corpus first.

**Verdict: no remaining contradictions. The Stage 0 contract is READY FOR
IMPLEMENTATION APPROVAL.**

### 16.9 · Stage 0 — BUILT, NOT DEPLOYED (2026-09-04)

Implemented against the locked §16.4 + §16.7 contract at `e154bdf`. **Three
files. No migration, no schema, no policy, no grant, no RPC, no renderer
change, no Teacher Exams change.** `git diff -- supabase/` is zero lines and
production is unchanged at 192 migrations, newest `20260904012019`.

| File | Change |
|---|---|
| `stimulus-editor.js` | **NEW**, 528 lines. The authoring half: normalise, parse, sample, build, hydrate |
| `teacher-homework.html` | the four visual editors replace the `Spec (JSON)` textarea |
| `tests/stimulus-editor.test.mjs` | **NEW**, 194 checks |
| `tests/teacher-homework-ui.test.mjs` | +22, to 185 |

#### The module, and why it is a module

Every pure function lives in `stimulus-editor.js` — the same pattern
`stimulus-view.js` and `weakness-view.js` use, so the browser and the Node
suite run **the same bytes**. It is deliberately not in the renderer and not in
the database: Stage 0's whole shape is that the *editor* samples a formula and
stores the result, which is what leaves both of those untouched.

The parser is a recursive-descent reader over a fixed token set with the §16.7.1
precedence table, and the suite proves it can never be anything else: `eval`,
`new Function`, `Function(`, `setTimeout`, `setInterval`, `__proto__` and
`globalThis` appear nowhere in its code, each pattern is shown to fire on a
string that does contain the construct, and seven attack inputs
(`eval("1")`, `constructor`, `__proto__`, `process.exit()` …) are refused as
ordinary unknown tokens.

#### Evidence

**Every pinned fixture reproduces exactly.** F1 `x^2-4*x+3` → 1 branch of 201 ·
F2 `2*x+5` → 1×201 · F3 `sin(x)` → 1×201 · F4 `sqrt(x+2)` → 1×141 with 60
samples dropped · F5 `ln(x)` → 1×100 with 101 dropped · F6 `1/x` → 2×100 ·
F7 `tan(x)` → **5 branches from 13 runs, 8 single-point runs discarded** ·
F8 `tan(x)` on `[-20,20]` → capped at 8 and the cap reported. F6 has exactly
one non-finite sample and F7 has **none**, so F7 is the fixture that isolates
the Y-delta heuristic, as §16.7.9 said it would be.

**13 of 13 generated specs were accepted by the live validator** — read-only
`exam_stimulus_spec_ok()` calls covering every structural shape the builders
emit: table with and without a note, bar, line, one-panel and three-panel pie,
number line with and without points, a function plus a labelled points group
with axis labels, 2 branches, 5 branches, 8 capped, and points with no
function. (Function-curve point arrays were truncated to their first two
entries for transmission; the validator inspects a curve's points for type and
length ≥ 2 and never for coordinate values, and branch counts are pinned
separately above.)

**41 of 41 editor mutants handled as designed**, including one **equivalent
mutant that must survive** — `201` written as `200 + 1`. The first attempt at
that control appended a comment to a statement sharing its line with a closing
brace, commenting the brace out; a control that breaks the parse tests nothing,
which is a lesson about controls rather than about the module. The mutants that
matter kill: `expr` stored without `points`, `points` without `expr`, only the
first branch kept, one figure for many curves, a one-point run rescued by
duplicating its point, a single marked point faked into two, the minimum
lowered, the sample count and precision changed, a domain error turned into
`(x, 0)`, the asymptote split removed, `^` made left-associative, `log`
silently becoming natural, any name accepted as a function, `2e` swallowed as a
number, each normalisation rule removed, branches hydrating as separate
functions, every fall-back condition disabled, and the page hand-building a
spec. Plus **66/66** H7 mutants, unchanged.

#### Three defects the work found

- **D-4 · the preview was not styled like the student's screen.** Visible only
  by looking at it: a parabola drew as a filled black polygon. `stimulus-view.js`
  emitted correct SVG, but the page carried **5 of the renderer's 33 `.sv-*`
  rules** — and an SVG `<polyline>` fills black unless `.sv-line` sets
  `fill:none`. The canonical stylesheet is now copied verbatim from `exam.html`,
  and a new assertion derives the class list **from the renderer itself**, so
  adding a class there turns the page red until it carries a rule.
  **`teacher-exams.html` has the identical gap** — its plot and chart previews
  are broken the same way today. Out of scope by decision; recorded as **I-6**.
- **D-5 · a contract check matched `Array.from(`.** The zero-table-reads
  assertion used a bare `\.from\(` and went red on the editor's own array
  building. It is now two checks — no `sb.from(` at all, and no `.from('…')`
  with a quoted argument — neither of which matches `Array.from`, and a third
  proving the client is used for RPCs so the pair is not vacuous.
- **D-6 · the page was reshaping chart inputs.** A mutant showed
  `currentInputs()` writing `panels:` and `chartType:` itself. The module
  already reads whichever half of the chart state the type calls for, so the
  page now hands the state over untouched. Nine spec keys are banned on the
  whole save path, and the ban is proven non-vacuous against the module.

#### The teacher's experience, driven in a real browser

Chromium, the real page (only the four CDN tags swapped for local stand-ins;
byte-identical from `<style>` onward), **no failing checks and no page
errors**. Table: type into the grid, add rows and columns, and a paste of
`City⇥Pop / Cairo⇥9 / Giza⇥4` fills headers and rows. Graph: the axes, `y =
x^2 - 4*x + 3`, `(2, -1) A` and `(4, 3) B` — and the preview draws one
polyline, two amber points and their labels **with no "defined by a formula"
note**. `y = x² − 4*x + 3` normalises through the superscript and the Unicode
minus; `2x` is refused with *"Write 2*x rather than 2x"*; `sec(x)` names the
token; a reversed axis is refused. `1/x` stores **two curves carrying the same
expr** and draws **two polylines**. Chart: a category/series grid and a panel
editor for pie, whose spec carries none of the bar keys. Number line: included
● / excluded ○ toggles that flip live. Advanced hides the visual editor,
pre-fills itself from what was built, and hands it back on close; SVG appears
only under the Advanced group and shows no visual editor at all.

#### Suites

| | |
|---|---|
| `stimulus-editor` | **204/204** (new) |
| `teacher-homework-ui` | **188/188** (was 163) |
| `stimulus-view` · `staff-nav` · `teacher-homework` · `teacher-access-scope` | 38 · 56 · 486 · 109 |
| `teacher-exam-ui` · `teacher-surface` · `repo-integrity` · `exam-page` · `teacher-exam-student` | 48 · 62 · 33 · 45 · 37 |
| Full CI | **68/68 green** (was 67) |
| Mutants | ed **47/47** · H7 66/66 · H4 75/75 · H5 81/81 · H6 46/46 |

#### The pre-merge review, and the two things it changed

The review of `b6212d5` verified §16.4 and §16.7 against the code rather than
only through the tests, and proved three boundaries by measurement:
`stimulus-view.js` is **byte-identical to `main`** (`cdd6e6b7…` both sides);
the copied stylesheet is **33 of 33 rules byte-identical to `exam.html`, in
order**, with all 13 tokens they resolve against identical too; and rendering
the same six specs in the student player's style context and the homework
page's gives **pixel-identical output**, the two `expr + points` plots
included. The persistence chain is the existing one end to end — the page
writes the same seven RPC parameters H3 defined, names no new table, uses no
browser storage, and the module touches neither the network nor the DOM.
Sharing is intact: editing sends the existing id so the RPC updates in place,
the figure editor never writes a question's `stimulus_id`, and a figure held by
two questions warns before it is changed.

Two findings were raised and then fixed on approval:

- **F-1 · a row not yet filled in was a type error.** Opening the number line
  and pressing Preview answered *"Every value must be a number."* about a field
  nobody had typed in — the empty-state sentence the contract specifies was
  unreachable. The graph editor already skipped a blank function row; the
  number line did not. It now skips a blank point row, and a blank interval row
  (both ends empty) with it, while **one** end filled is still a real mistake
  and still refused. Nothing else moved: a non-numeric value, an out-of-range
  point and a reversed interval are refused exactly as before. Five mutants
  cover it, including one that "helpfully" invents `0` for a blank point.
- **R-1 · the page shadowed a renderer name.** Its editor painter was called
  `renderPlot()` — the same name as `stimulus-view.js`'s private figure-drawing
  `renderPlot()`. Different scopes, so nothing was broken, but nothing stopped
  a future reader confusing them. Renamed to `paintPlot()` across eight
  references, with a comment giving the rule — *the editor is painted, the
  figure is rendered* — and an assertion that **no page function shadows any of
  the renderer's six private names**, which also proves the renderer still owns
  them.

#### Recorded, not done

- **I-6 · `teacher-exams.html` carries 5 of 33 renderer rules**, so its plot,
  chart and pie previews mis-draw exactly as the homework page did. A
  four-line CSS fix, deliberately not made here: Teacher Exams is out of Stage
  0's scope.
- **L-1 stands.** A single marked point still cannot be stored; the editor says
  *"A group needs at least two points — the paper format cannot store a single
  one."* rather than faking one. Stage 3.
- Stages 1–4 untouched: no expression rendering, no raster images, no
  accessibility or `display` work, no AI, no image→editable.

### 16.10 · Stage 1 — DEFINITION (2026-09-05)

Stage 1 has been referred to five times in this document and defined nowhere.
The Stage 1 entry audit found exactly that and blocked on it, so this section
is the definition — **and nothing more**. No renderer, no evaluator, no code,
no schema, no migration.

**Provenance, marked throughout.** Every clause below carries one of five
labels, so a later reader can tell a standing requirement from a decision taken
today from a gap still open:

- **[roadmap]** — already stated elsewhere in this document, with the section
  cited. This section restates it, it does not create it.
- **[formalized]** — written down here for the first time, but derived entirely
  from a **[roadmap]** statement. It adds no requirement the roadmap does not
  already imply.
- **[stage-1 scope]** — a constraint the roadmap imposes on **Stage 0** and
  never on Stage 1, which Stage 1 adopts by explicit approval. It is a real
  requirement, and it is **not** something this document already said.
- **[design decision]** — a behavioural choice among candidate rules that the
  roadmap does not determine. It **adds a requirement**, and the alternatives
  it rejected are recorded beside it, so a later reader can see it was a
  choice and not a reading.
- **UNSPECIFIED** — a genuine gap. §16.10.8 lists them. **None is filled by
  guessing**, and Stage 1 is not complete while one of them is being answered
  implicitly by code rather than explicitly by a decision.

#### 16.10.1 · Goal

> **Stage 1 renders a supported `expr` curve directly from the existing
> structured stimulus model** — the formula becomes a drawn line at render
> time, rather than only at authoring time.

**[roadmap]** §16.3: *"The formula is the record of intent, which Stage 1 will
render directly; the points are what today's renderer draws."* §16.7.5 says the
same of the storage law. §16.6 names expression rendering as Stage 1 and
excludes it from Stage 0.

The problem it solves, measured on the live renderer: `stimulus-view.js` has
**one** `expr` reference and it is a comment saying it does not evaluate one
(lines 271-273). A curve with no `points` array is counted as `unplottable` and
reported under the figure as *"…is defined by a formula and is not drawn
here."* That note is honest degradation, not a defect — and Stage 1 is the
increment that makes it unnecessary **for a supported expression**. What
becomes of the note itself is **U-4**, which this section does not decide.

#### 16.10.2 · Scope

1. **The locked expression grammar of §16.7, and nothing beyond it.**
   **[roadmap]** §16.2 decision 4 and §16.7 (O-1 CLOSED). The whitelisted
   function list, the precedence table, the normalisation rules and the
   rejection sentences are fixed. Stage 1 **consumes** that grammar; it does
   not extend it.
2. **The `expr` + `points` storage law is unchanged.** **[roadmap]** §16.7.5,
   restated by O-4 in §16.7.11. A function curve continues to store **both**.
   Stage 1 changes what is *drawn*, never what is *stored*.
3. **The structured stimulus architecture is unchanged.** **[roadmap]** §16.2:
   *"extend, do not replace"* — the pipeline stays
   `kind + validated spec JSONB → shared renderer → SVG output`, and there is
   **no parallel visual system**.
4. **The O-4 adjacency rule is mandatory, not advisory.** **[roadmap]**
   §16.7.11. Stage 1 groups `curves[]` into functions by adjacency; its
   function identity must agree with `hydratePlot`'s.
5. **Raw SVG stays.** **[roadmap]** §16.2 decision 5. Stage 1 neither removes
   it nor touches it.

#### 16.10.3 · Deliverables

1. **An expression evaluation capability available at render time.**
   **[formalized]** from §16.3 and §16.7.5 — rendering `expr` directly requires
   evaluating it somewhere the renderer can reach. **Where that code lives is
   UNSPECIFIED (U-2).**
2. **Integration with the existing renderer**, through the existing entry
   point. **[roadmap]** §16.4 names `window.StimulusView.render()` as the only
   renderer entry point Stage 0 may call; §16.2's *no parallel visual system*
   extends the constraint past Stage 0. **[formalized]:** Stage 1 adds a
   capability *behind* that entry point and does not introduce a second one.
3. **Tests for the locked grammar and for O-4 behaviour.** **[roadmap]**
   §16.7.7 lists what the grammar adds to the test plan; §16.7.11 lists the
   seven O-4 obligations and the four mutants. Stage 1 ships both sets against
   whatever code it adds.

#### 16.10.4 · Success criteria

1. **Supported expressions render correctly** — the eight pinned fixtures of
   §16.7.9 (F1–F8) draw, and their branch counts, **taken through the Stage 0
   sampler's constants**, are exactly the pinned numbers. **[roadmap]**
   §16.7.9. Whether the renderer itself draws at that density is **U-5**, which
   this criterion does not decide.
2. **Multi-branch expressions follow O-4 exactly** — the seven obligations of
   §16.7.11 pass and its four mutants are killed. **[roadmap]** §16.7.11.
3. **Each branch remains a separate polyline.** N branches draw N polylines;
   grouping is function *identity* and never merged geometry. **[roadmap]**
   §16.7.11 obligation 2, already half-pinned at
   `tests/stimulus-editor.test.mjs:419`.
4. **Renderer function identity agrees with `hydratePlot`** — for every
   fixture, the renderer's function count equals
   `hydrate('plot', spec).inputs.functions.length`. **[roadmap]** §16.7.11
   obligation 7.
5. **No arbitrary JavaScript evaluation.** `eval`, `Function(`, `new Function`,
   `setTimeout`, `setInterval`, `__proto__` and `globalThis` appear nowhere in
   the code Stage 1 adds; each pattern is shown to fire on a string that does
   contain it; and attack inputs are refused as ordinary unknown tokens.
   **[roadmap]** §16.2 decision 4 and §16.7; the precedent is the Stage 0
   grammar-closure test recorded in §16.9.
6. **Existing points-based behaviour is intact.** Every fixture in
   `tests/fixtures/stimuli.json` renders as it does today. **[formalized]**
   from §16.2's *extend, do not replace*.

   *Measured 2026-09-05, and it makes this criterion cheap to meet honestly:*
   the fixture corpus is **12 stimuli, 5 of them plots, 6 curves — and
   `expr` appears on zero of them.** Every live curve is points-only. **Stage
   1 therefore cannot regress the stored corpus, because the stored corpus
   contains no expression to re-draw.** The population that changes is content
   Stage 0 authors (which always carries both keys — U-1) and hand-written
   `expr`-only specs (which draw nothing at all today).

#### 16.10.5 · Explicit non-goals

All **[roadmap]**, from §16.2 and §16.6:

- **No new visual architecture** — no parallel renderer, no second entry point.
- **No raster images / Storage** — that is Stage 2 (§16.2 decision 2).
- **No `reading` / alt-text, no `display` key** — that is Stage 3 (§16.2
  decision 3, §16.6 O-3).
- **No AI generation, no image → editable** — that is Stage 4 (§16.2 decisions
  6 and 7).
- **No expansion of the locked expression grammar** — §16.7 is closed; a new
  function, operator or constant is a separate decision, not a Stage 1
  convenience.
- **No raw SVG changes** — §16.2 decision 5.

Two more, and they are **[stage-1 scope]** rather than **[roadmap]**: the
roadmap states both of **Stage 0** (§16.2 decision 1 — *"Zero database, schema,
policy, migration or renderer changes"* — and §16.6's *"Stage 0 does not"*
list) and never of Stage 1. Stage 1 adopts them by explicit approval, and they
are labelled so that a later reader is not told the document already said them:

- **No new schema** — no table, column, policy, grant, RPC or migration.
- Stage 1 does not change the database, any policy, any grant, any RPC,
  Teacher Exams' or the student player's access model, or the analyzer
  boundary. The Stage 0 sentence *"`git diff -- supabase/` is zero lines"*
  (§16.9) is the standard Stage 1 inherits.

#### 16.10.6 · Dependencies

| | | |
|---|---|---|
| **O-1** · the whitelisted function list | **CLOSED** 2026-09-04 | §16.7 |
| **O-2** · sampling, precision, branch caps | **CLOSED** 2026-09-04 | §16.7.4 |
| **O-4** · function identity | **CLOSED** 2026-09-05 | §16.7.11 |

**O-1 is a hard precondition, not a courtesy.** §16.2 decision 4 states it in
those terms: the function list is *"to be settled before any expression
renderer is written."* All three are now closed, so **no dependency blocks
Stage 1**.

**O-3 (whether Stage 0 offers `dashed`) remains OPEN and does not block Stage
1** — it governs what the *editor* emits, and §16.6's proposal defers `display`
to Stage 3 either way.

#### 16.10.7 · Exit criteria

Stage 1 is complete when all of the following are true and have been measured,
not asserted. Each is checkable by running something.

1. **F1–F8 render**, with the branch counts of §16.7.9 reproduced exactly
   through the Stage 0 sampler's constants (renderer density is **U-5**).
2. **The seven O-4 obligations of §16.7.11 pass**, and its four mutants are
   killed.
3. **Function-identity agreement holds for every fixture** — renderer count
   equals `hydrate('plot', spec).inputs.functions.length`.
4. **Branch geometry is preserved** — N branches, N polylines.
5. **The grammar-closure test passes** on every module the renderer reaches to
   evaluate an expression, newly written **or reused**, in the shape §16.9
   records for Stage 0: each forbidden pattern proven able to fire, and attack
   inputs refused as unknown tokens.
6. **Every fixture in `tests/fixtures/stimuli.json` renders as it does today**,
   compared output-to-output rather than by inspection.
7. **Stage 0's round trip is unmoved** — `hydrate` → `build` still holds for
   the corpus, and the authoring side's function identity is unchanged,
   wherever that module lives (**U-2**).
8. **`git diff -- supabase/` is zero lines**, and the applied migration count
   and newest version are unchanged from before the increment.
9. **CI is green**, the whole gate, with the new checks counted and the count
   recorded.
10. **Every UNSPECIFIED item in §16.10.8 has been explicitly closed or
    explicitly deferred.** An item answered only by what the code happens to do
    is not closed. This criterion exists because the Stage 1 entry audit was
    blocked by exactly that failure at the stage boundary.

#### 16.10.8 · What remains UNSPECIFIED

Recorded as gaps, **not decided here**. Each needs an explicit decision before
or during Stage 1, in the way O-1, O-2 and O-4 were decided.

- **U-1 · CLOSED by §16.10.10** (2026-09-05) — `expr` outranks `points` when
  it is drawable; `points` are the fallback. The question it answered:
  **which source a curve carrying BOTH `expr` and `points` draws from.**
  Every Stage 0 curve carries both — that is the storage law (§16.7.5). §16.3
  says `points` are *"what today's renderer draws"* and `expr` is what *"Stage 1
  will render directly"*, which implies a preference but never states a rule.
  Draw from `expr` and ignore `points`? Prefer `expr` and fall back? Draw
  `points` and use `expr` only when there are none? The three differ in what a
  teacher sees for content already authored, and **this is the only case that
  occurs in practice** (§16.10.4 criterion 6). UNSPECIFIED.
- **U-2 · CLOSED by §16.10.12** (2026-09-05) — the evaluator moves into one
  new module, **`stimulus-expr.js`**, which both `stimulus-editor.js` and
  `stimulus-view.js` depend on and which depends on neither. The question
  it answered: **where the Stage 1 evaluator lives.** §16.9 records that the parser and
  sampler already exist in `stimulus-editor.js`, as a module the browser and
  the Node suite run as the same bytes. Whether Stage 1 reuses that module,
  moves it to a shared core, or writes a second evaluator is not stated. The
  repository's `_shared/` single-source pattern and §16.2's *no parallel visual
  system* both point one way, but **pointing is not deciding**, and a second
  evaluator would be exactly the divergence §16.7.11 warns about. UNSPECIFIED.
- **U-3 · CLOSED by §16.10.13** (2026-09-05) — **Policy A**: Stage 1 reaches
  every page that loads `stimulus-view.js`, with no source-level exception
  inside `exam.html`, and ships as ONE increment. The question it answered:
  **which surfaces Stage 1 reaches, and when it deploys.** Stage 0 is
  BUILT, NOT DEPLOYED (§16.9). Whether Stage 1 ships with it, after it, or
  separately — and whether it reaches the student player, the staff pages, or
  both — is not stated anywhere. UNSPECIFIED.
- **U-4 · CLOSED by §16.10.10** (2026-09-05) — the note survives, narrowed to
  the case where nothing can be drawn from either source. The question it
  answered: **what becomes of the *"defined by a formula and is not drawn
  here"* note.** It is the renderer's honest-degradation path for a curve with no
  points, and `tests/stimulus-view.test.mjs:112-113` asserts it fires for
  `{expr: 'x^2'}` with no points — **an assertion Stage 1 will make false**.
  Whether the note is removed, narrowed to unsupported expressions, or kept for
  a parse failure is not stated. UNSPECIFIED, and it is a shipped contract, so
  it cannot be changed silently.
- **U-5 · CLOSED by §16.10.11** (2026-09-05) — the renderer samples at
  **exactly the Stage 0 constants**: 201 samples, `DP = 4`,
  `MAX_BRANCHES = 8`, `MIN_POINTS = 2`. The question it answered: **the
  rendering resolution.** O-2 fixed 201 samples and 4 decimal
  places **for storage** (§16.7.4). Whether the renderer resamples for display,
  and at what density, is a separate question O-2 did not answer. §16.7.11's
  *"introduces no new sampling constant"* binds the **test fixtures**; it does
  not settle the renderer. UNSPECIFIED.

#### 16.10.9 · Scope of this section

This section defines Stage 1. It **implements nothing**: no renderer, no
evaluator, no test, no Stage 0 change, no database or schema change, no
migration. Stages 2–4 are untouched. The first Stage 1 increment is the
expression renderer, built on the closed O-4 decision — and it starts by
closing U-1, U-2 and U-4, because all three change what it must be written to
do.

#### 16.10.10 · U-1 + U-4 CLOSED — the `expr` / `points` precedence (2026-09-05)

Read-only audit, then a decision. No code, no test, no schema. U-1 and U-4 are
**one** decision — U-1 asks which source a curve carrying both keys draws from,
U-4 asks what happens to the *"defined by a formula and is not drawn here"*
note — and the same truth table settles both. Deciding them apart would have
risked a rule that contradicts itself at the boundary.

##### The rule, LOCKED

> **U-1/U-4 (CLOSED).** For every curve in a `plot`, in this order:
>
> 1. A curve with a **string `expr`** that is **drawable** is rendered **from
>    `expr`**; `points` are not consulted.
> 2. A curve whose `expr` is **not drawable** falls back to its stored
>    `points` and draws them, if it has a drawable set.
> 3. A curve that can be drawn from **neither** emits the existing note.
> 4. A curve with **no string `expr`** renders exactly as today, from
>    `points`. A **non-string** `expr` is treated as **absent**.
> 5. `points` remain **stored** in every case.

##### `drawable` is a named predicate, and only half of it is closed here

It splits in two, and the halves have different owners:

- **not drawable — parse failure.** Fully determined by the locked §16.7.1
  grammar and **independent of sampling density**, so it is **closed by this
  decision**. Measured: `@@bad@@` returns the identical sentence on
  `[-5,5]²`, `[0,1]²` and `[-100,100]²`.
- **not drawable — no drawable part in range.** Depends on how the renderer
  samples. **Whether a given expression is in this state is U-5's to define**
  and is NOT closed here.

**The boundary, stated exactly:**

> **U-1/U-4 fixes what happens in each row of the table below. U-5 fixes which
> row a given `(expr, xRange, yRange)` lands in.**

##### Provenance of each rule

| Rule | Label | Basis |
|---|---|---|
| **1** · `expr` outranks `points` | **[roadmap]** | §16.7.11 — *"Stage 1 renders from `expr`; `points` stay the answer for any renderer that does not evaluate one"*; §16.3 — *"the points are what **today's** renderer draws"* |
| **2** · fallback to `points` on failure | **[design decision]** | R-C chosen over R-A. The roadmap requires no fallback; R-A would leave a blank graph beside usable points |
| **3** · the note survives, narrowed | **[design decision]** | Keeps the mechanism §16.3 and §16.7.5 both cite, but in **strictly fewer** cases than today. The narrowing is the decision |
| **4** · non-string `expr` is absent | **[design decision]** | Forced by **V-1** below; the roadmap never contemplates it |
| **5** · both stay stored | **[roadmap]** | §16.7.5, restated by O-4 in §16.7.11 |

**[stage-1 scope] is used for none of the five**, correctly: not one of them is
a Stage 0 constraint being adopted.

##### The evidence

**The boundary is narrow.** Exactly two modules read `curves[]` —
`stimulus-view.js:266` (`renderPlot`, the only renderer, which **never** reads
`.expr`) and `stimulus-editor.js:476-488` (`hydratePlot`). `exam.html`,
`teacher-exams.html` and `teacher-homework.html` all go through
`StimulusView.render()`. So this decision has **one implementation site and one
agreement site**.

**`expr` alone has always been a complete curve.** `exam_stimulus_spec_ok`,
read from production, validates a curve with a **disjunction** —
`(expr is a string) OR (points is an array of length >= 2)` — in a validator
that predates Stage 0. Calling the live function: `{"expr":"x^2"}` →
`storable = true`. Rule 1 is therefore not an extension of the storage model.

**Stage 0 can neither author nor edit an expr-only curve** (measured on the
shipped module): `build` emits **both** keys on every path, and `hydrate`
refuses a curve with no `points` into Advanced. Combined with a live corpus of
**12 stimuli, 5 plots, 6 curves and `expr` on zero of them**, this is what
disqualified the points-authoritative candidate: it would have made Stage 1 an
increment observable only on hand-written Advanced JSON, which §16.2 decision 5
says the normal teacher workflow never requires.

**Failure kinds were already distinguished** before this decision (§16.7.3, and
measured): a parse failure returns its own teacher-facing sentence, while
`1/0` parses and returns *"This function has no drawable part in the range you
set."* `1/0` is empty at **any** density, so row 5 below is non-empty however
U-5 resolves.

##### The truth table

Outcomes are determined for all eleven rows. **Membership** — which row an
input lands in — is U-5-dependent for five of them.

| # | curve | storable | today | closed rule | membership |
|---|---|---|---|---|---|
| 1 | `points`(≥2), no `expr` | ✓ design | draws | **unchanged** | closed |
| 2 | `points`(1), no `expr` | ✓ **V-1** | 1-vertex polyline | **unchanged** | closed |
| 3 | `expr` only, drawable | ✓ design | note | **draws from `expr`** | **U-5** |
| 4 | `expr` only, **parse failure** | ✓ design | note | **note** | closed |
| 5 | `expr` only, empty in range | ✓ design | note | **note** | **U-5** |
| 6 | `expr`+`points`, drawable, agreeing | ✓ design | draws points | **draws from `expr`** | **U-5** |
| 7 | `expr`+`points`, drawable, **disagreeing** | ✓ design | draws points | **draws from `expr`** | **U-5** |
| 8 | `expr`+`points`, **parse failure** | ✓ design | draws points | **draws points** | closed |
| 9 | `expr`+`points`(1 or `[]`), drawable | ✓ **V-1** | invisible / note | **draws from `expr`** | **U-5** |
| 10 | non-string `expr` + `points` | ✓ **V-1** | draws points | **draws points** | closed |
| 11 | neither key | ✓ **V-1** | note | **note** | closed |

Rows 1, 2 and 11 are the points-only guarantee. Rows 4 and 5 are where the
U-4 note **survives**; row 3 is where it **disappears**. **Row 7 is U-1's
core**, and it is the only row that separates the three candidate rules.

##### The discriminating mutants

Nine of the ten are assertable the moment this rule is implemented; one waits
for U-5.

| # | Boundary | Test | Mutant killed | U-5? |
|---|---|---|---|---|
| **M-1** | row 7 — U-1's core | `{expr:'x^2', points:[straight line]}` → the drawn path is **non-monotonic in y** (a parabola), not monotonic (the line) | prefer `points` | independent |
| M-2 | row 3 | `{expr:'x^2'}` → a path is drawn, **no** formula note | keep the `unplottable` path | independent |
| M-3 | rows 1-2 | every points-only fixture still draws, with the **same counts of polyline / circle / polygon and the same labels**, and no formula note | route points-only through the evaluator | independent |
| M-4 | row 8 | `{expr:'@@bad@@', points:P}` → the points still draw | strict `expr`-only → blank | independent |
| M-5a | row 4 | `{expr:'@@bad@@'}` → note, nothing drawn | drop the note | independent |
| M-5b | row 5 | `{expr:'1/0'}` → note, nothing drawn | drop the note | **dependent** |
| M-6 | row 9 | `{expr:'x^2', points:[[0,0]]}` → a visible path, not a 1-vertex polyline | prefer `points` | independent |
| M-7 | row 10 | `{expr:123, points:P}` → points draw, evaluator never called | treat a truthy `expr` as an expression | independent |
| M-8 | O-4 agreement | renderer function count `===` `hydrate('plot', spec).inputs.functions.length` | global grouping | independent |
| M-9 | **equivalent guard** | reorder the two fallback branches, behaviour identical | **must SURVIVE** | independent |

**M-1 is shape-based on purpose.** Asserting a vertex count would make it
depend on U-5; asserting the shape does not. Measured on today's renderer: the
fixture draws the straight line (monotonic in y, 5 vertices), and a real `x^2`
sampling is non-monotonic. **The live corpus cannot discriminate here** —
stored points always agree with their `expr` — so the fixture must be built to
disagree.

**M-3 preserves rendered behaviour, not bytes.** A byte-identical requirement
would turn an implementation detail into a contract, and density is exactly
what changes the bytes; if such a guard is wanted it belongs with **U-5** and
needs its own justification.

**`tests/stimulus-view.test.mjs:112-113` is replaced by M-2 + M-5a, not
deleted.** The contract *"an expression curve is reported, not dropped in
silence"* survives verbatim for rows 4 and 5; only its fixture changes, from a
drawable `x^2` to an expression that cannot be drawn.

##### V-1 · an open defect found while measuring this, NOT fixed here

`exam_stimulus_spec_ok` **fails open** on three curve shapes, through SQL
three-valued logic rather than by design: `jsonb_typeof()` of an absent key is
NULL, `NULL or false` is NULL, and `not NULL` never flags the row. Measured on
production:

| curve | `expr` arm | `points` arm | flagged invalid? |
|---|---|---|---|
| `{"expr":"x^2"}` | true | null | false — **by design** |
| `{"expr":"x^2","points":[[0,0]]}` | true | false | false — **by design** (the ≥2 floor is bypassed) |
| `{"points":[[0,0]]}` | null | false | **null — fails open** |
| `{}` | null | null | **null — fails open** |
| `{"expr":123}` | false | null | **null — fails open** |

So a curve with **neither key** is storable today. This is why rule 4 exists
and why rows 2, 9, 10 and 11 are in the table at all: the renderer cannot
assume any shape. **V-1 is recorded, not fixed** — it is a storage-layer
decision of its own, and Stage 1 changes no database object.

##### What this does NOT close

- **U-5 · CLOSED by §16.10.11** (2026-09-05). It was BLOCKING, and the reason
  given here was **wrong**: this bullet claimed that
  `tests/stimulus-editor.test.mjs:419` (two polylines for `1/x`) becomes
  density-dependent. **Measured, it does not** — `1/x` yields 2 branches at
  every density from 51 to 1601, so that assertion is density-INDEPENDENT.
  The dependency was real but the example was not: the density-sensitive cases
  are **`tan(10*x)` / F8**, where the branch count moves 1 → 5 → 8-capped, and
  the **visibility gate**, which rejects `x^2` in `y=[-0.01,0.01]` below 101
  samples. The second is what made U-5 genuinely blocking — until the density
  was fixed, rule 1's *"drawable"* predicate had no value.
- **U-2 stays OPEN.** Nothing here says where the evaluator lives.
- **U-3 stays OPEN.** Nothing here says which surfaces Stage 1 reaches or when
  it deploys.
- **V-1 stays OPEN**, above.
- **The grammar is consumed, not extended** — "drawable" means exactly what
  §16.7.1-16.7.4 already define, and §16.7 remains locked.

#### 16.10.11 · U-5 CLOSED — the renderer's sampling density (2026-09-05)

Read-only audit, then a decision. No code, no test, no schema, and **the Stage
0 sampler was not modified**.

##### The rule, LOCKED

> **U-5 (CLOSED).** Stage 1's renderer samples an `expr` at **exactly the
> Stage 0 constants** — **201 samples, `DP = 4`, `MAX_BRANCHES = 8`,
> `MIN_POINTS = 2`** — and derives branches by the §16.7.4 rules unchanged.
> It introduces **no new sampling constant**, and the four values have
> **exactly one definition in the shipped source**.

| Clause | Label | Basis |
|---|---|---|
| the four constants, reused exactly | **[design decision]** | R-1 chosen over R-2/R-3/R-4 below; the roadmap fixes no render density |
| no new sampling constant | **[roadmap]** | §16.7.11's obligation, already binding |
| exactly one source definition | **[design decision]** | drift prevention; the repository's `_shared/` single-source pattern is the precedent, not a roadmap statement about Stage 1 |

##### Method, and why it is not vacuous

The constants are module-private, so the measurements below ran the **real
shipped algorithm at other densities**: `stimulus-editor.js` was loaded into a
fresh VM context with `var SAMPLES = 201;` rebound and **every other byte
identical**. The harness refuses to run if the anchor moved or the rebind did
not apply, and its self-check reproduces **all 7 pinned §16.7.9 fixtures at
201** — a harness that could not reproduce them would prove nothing about the
densities it varies.

##### Storage guarantees are not rendering guarantees

`stimulus-editor.js:38-41`, read against `sample()` at `:219-252`:

| constant | what it guarantees for STORAGE | what it implies for RENDERING |
|---|---|---|
| `SAMPLES = 201` | how many candidate points exist to store | **nothing** — a stored polyline can be re-derived at any N |
| `DP = 4` | §16.7.10 rule 4's *"rounded once to 4 decimal places"* — a **stored-value** precision | **nothing**; a render path need not round at all |
| `MAX_BRANCHES = 8` | at most 8 curves per function in the spec | a cap on drawn polylines **only if** the renderer re-derives them |
| `MIN_POINTS = 2` | `exam_stimulus_spec_ok` requires `points >= 2` — **the database's own floor** | nothing directly; it is a storability rule |

`MIN_POINTS` is the only one with an external anchor. **No roadmap sentence
tells the renderer what density to use**, which is why U-5 was a real gap and
not an oversight.

##### The measurements

Branch counts, N = 51 … 1601, pinned fixtures:

| | 51 | 101 | 201 | 401 | 801 | 1601 |
|---|---|---|---|---|---|---|
| F1 `x^2-4*x+3` · F2 `2*x+5` · F3 `sin(x)` · F4 `sqrt(x+2)` · F5 `ln(x)` | 1 | 1 | 1 | 1 | 1 | 1 |
| F6 `1/x` | 2 | 2 | 2 | 2 | 2 | 2 |
| F7 `tan(x)` on `[-5,5]` | **5** | **5** | **5** | **5** | **5** | **5** |
| F8 `tan(x)` on `[-20,20]` | **5** | 8 capped | 8 capped | 8 capped | 8 capped | 8 capped |

Twelve adversarial fixtures — poles landing **on** a grid point
(`1/(x-2.5)`), **between** grid points (`1/(x-2.525)`), `1/(x-0.001)`,
`1/x^2`, `1/(x^2-1)`, `x^5`, `sqrt(x)`, `ln(x)` and `sin(50*x)` — are all
**density-stable**. Only two are not:

| fixture | 51 | 101 | 201 | 401 | 801 | 1601 |
|---|---|---|---|---|---|---|
| **`tan(10*x)`** | **1** | **5** | 8 capped | 8 capped | 8 capped | 8 capped |
| **`x^2` in `y=[-0.01,0.01]`** | **REJECTED** | ok | ok | ok | ok | ok |

At N = 51 `tan(10*x)` draws **through** its poles as a single curve, which is
wrong rather than merely coarse. The second is the **visibility gate**
(`sampleFunction` rejects when `visible < 2`), and it is why U-5 was blocking:
until the density is fixed, U-1/U-4's *"drawable"* predicate has no value.

**Count stability is not geometry stability.** Turning points drawn against
the true function:

| | 51 | 101 | 201 | 401 | 801 |
|---|---|---|---|---|---|
| `sin(20*x)` — truth 64 | **36** | 64 | 64 | 64 | 64 |
| `sin(50*x)` — truth 159 | **40** | **40** | 158 | 158 | 158 |

Nyquist gives the mechanism: `sin(50*x)` gets **0.6 / 1.3 / 2.5** samples per
period at N = 51 / 101 / 201.

**Going higher costs and gains nothing measured.** SVG bytes for one
`x^2-4*x+3` curve through the live renderer: **1.52x at 401, 2.53x at 801,
4.59x at 1601, 8.78x at 3201** — while no fixture gains a branch or a turning
point. A precision conflict also opens: at a vertex one step changes `y` by
`dx^2`, so once `dx^2 < 5e-5` consecutive samples share an identical rounded
`y` and the curve stair-steps. Measured flattening: **0.0% at N <= 801**,
0.1-0.6% at 1601, up to **1.3% at 3201** — the threshold is exactly N ~ 1601.

##### Candidates rejected

- **R-2 · a separate display density (401 / 801).** Rejected: 1.5-2.5x the
  bytes for **zero measured shape gain** on any fixture, and it makes the
  primary and the fallback paths draw **different figures**.
- **R-3 · adaptive density**, derived from the viewport or the x-range.
  Rejected: a new policy the roadmap does not authorise, it makes branch count
  a function of viewport so §16.7.9's fixtures stop being pinnable, and it
  makes the tests non-deterministic.
- **R-4 · reuse the constants but skip `DP` rounding on the render path.**
  Rejected as **measurably a no-op**: flattening is 0.0% at 201, so its only
  benefit appears at densities R-1 never reaches.

##### Why R-1, stated as evidence

1. **It is the only rule under which the primary and the fallback paths
   agree.** §16.10.10 rule 2 lets a fallback to stored `points` fire at any
   time; at any other density the two paths draw different figures, so a parse
   regression would silently change the drawing.
2. **Both bounds converge on 201.** Below it, structure is lost — measured:
   `tan(10*x)` through its poles, F8 down three branches, the visibility gate
   refusing a fixture it should accept, `sin(20*x)` and `sin(50*x)` under
   Nyquist. Above it, nothing is gained and bytes grow 1.5-8.8x, with `DP = 4`
   fighting the density past 801. **201 is the lowest density at which no
   measured fixture loses structure and the highest at which nothing is
   wasted.**
3. §16.7.9's eight fixtures become **renderer invariants for free** — they
   were derived at these constants.
4. The literal `201` appears **exactly once** in shipped source
   (`stimulus-editor.js:38`). Keeping it so is a constraint, not an accident.

##### F7 — which invariant belongs to which layer

| N | runs | discarded | **kept** | sizes |
|---|---|---|---|---|
| 51 | 7 | 2 | **5** | `[2,15,15,15,2]` |
| 201 | 13 | **8** | **5** | `[5,61,61,61,5]` |
| 1601 | 33 | 28 | **5** | `[43,496,495,496,43]` |

The kept count is **5 at every density**; the discarded count is not. So:

- **"5 branches" is a RENDERER invariant** — density-stable, mathematically
  right (4 poles → 5 intervals), and what a student sees.
- **"8 discarded runs" stays a STORAGE-only invariant.** It is an artefact of
  run-splitting at one N. §16.7.10 already pins it in the editor suite;
  promoting it to a renderer invariant would pin an implementation detail.

##### The discriminating mutants

| # | Test | Kills |
|---|---|---|
| **D-1** | `tan(10*x)` on `[-5,5]` → **8** branches | any density < 201 (51 → 1, 101 → 5) |
| **D-2** | `x^2` in `y=[-0.01,0.01]` renders rather than being rejected | density <= 51 |
| **D-3** | `sin(20*x)` draws at least 60 turning points | density <= 51 (36) |
| **D-4** | **primary ≡ fallback** — the same function rendered from `expr` and from its stored `points` produces the **identical** SVG | *every* density rule except R-1; this is the test that pins the decision |
| **D-5** | F1-F8 branch counts drawn by the renderer equal §16.7.9's table | any density where F8 ≠ 8 |
| **D-6** | the sampling constants appear **once** in shipped source | a second hard-coded `201` — the drift hazard |
| **D-7** | *equivalent guard* — reorder the branch-keeping loop, behaviour identical | **must SURVIVE**, proving the suite pins behaviour and not source text |

##### What U-5 settles for U-1/U-4

It **completes the predicate U-1/U-4 deferred.** *"Not drawable — no drawable
part in range"* now means: `sampleFunction`, at these constants, returns an
error — no branches, or `visible < 2`. §16.10.10's rows **3, 5, 6, 7 and 9**
gain determinate membership, and **M-5b is now assertable with any fixture**,
not only the unconditional `1/0`.

##### Consequence for U-2 — identified, NOT resolved

R-1 means the renderer needs **exactly** what `sampleFunction` already
computes, at exactly its constants. Reuse becomes the cheap option and a second
evaluator now has to justify duplicating four constants and a pinned
algorithm — but **U-2 stays open**, because at least three shapes satisfy R-1:
the renderer imports `stimulus-editor.js`; the sampler moves to a shared core
both import; or a thin wrapper is added. **R-1 is neutral among them and
chooses no placement.**

Two things U-5 hands U-2. A **constraint**: whichever shape wins, the four
constants must have one definition, enforced by D-6. And a **tension**,
recorded rather than blocking: `DP = 4` is a storage precision with no
rendering purpose, so reusing `sampleFunction` verbatim inherits it — which
costs **0.0% at 201**, measured. A cleanliness question, not a correctness one.

##### Still open

**U-2** and **U-3** remain OPEN. **V-1** remains OPEN and unfixed. The grammar
is consumed, not extended. The Stage 0 sampler is **unmodified** — the harness
rebinds a constant in memory and writes nothing.

#### 16.10.12 · U-2 CLOSED — where the Stage 1 evaluator lives (2026-09-05)

Read-only audit, then a decision. No code, no test, no HTML, no schema.

##### 1 · Placement, LOCKED

> **U-2 (CLOSED).** The expression evaluator moves into **one new browser
> module, `stimulus-expr.js`** — the constants, `normalize`, `tokenize`,
> `parse`, `evalAt`, `sample` and `sampleFunction`. **`stimulus-editor.js` and
> `stimulus-view.js` both depend on it; neither depends on the other.** It is
> the **one definition** of the four constants U-5 locked.

**[design decision]** — the roadmap names no location, and three of the five
options were eliminated on recorded rules rather than taste (below).

**The split was proved by execution, not by reading.** Lines 34-263 of today's
`stimulus-editor.js` were extracted into a candidate module and run in a fresh
VM: it **runs in isolation**, carries all four constants (`201 / 4 / 8 / 2`),
and is **15/15 behaviourally identical** to the shipped module across F1-F8,
`tan(10*x)`, the visibility-gate fixture and every error path, with `normalize`
parity too. It is **10,558 bytes of 25,921** — 41% of the module.

**No cycle is created**, because the dependency inside the module is already
one-way: `buildPlot` calls `sampleFunction`, and nothing in the expression half
calls the authoring half. Today the two modules do not reference each other
**at all** — `stimulus-editor.js` names `stimulus-view.js` only in a header
comment, and `stimulus-view.js` never mentions the editor.

**Why not the alternatives:**

- **A · `stimulus-view.js` reads `window.StimulusEditor`.** Rejected: it makes
  the student-facing renderer depend on the authoring module, and costs
  **+26,482 B (+18%)** on `exam.html` against **+10,558 B (+7%)** for this
  option — while `teacher-homework.html` pays **net zero** under B.
- **C · duplicate the sampler in the renderer.** Rejected by U-5's **D-6**: the
  constants would have two definitions.
- **D · a thin wrapper around the editor's export.** Strictly worse than A —
  adds a file and still ships the whole editor.
- **E · inject the sampler per page.** Rejected on a design ground: the same
  spec would draw differently depending on page wiring, which contradicts one
  renderer, makes U-1/U-4 page-dependent, and makes U-5's **D-4** untestable as
  a global property.

**Relocation is authorised by §16.10.7 exit criterion 7**, which pins Stage 0's
behaviour and not its location: *"the authoring side's function identity is
unchanged, **wherever that module lives** (U-2)."*

##### 2 · The name, and why NOT `*.core.js`

**`*.core.js` has one meaning in this repository, in 2 of 2 occurrences: an
authored source that has a generated byte-copy, a sync script and a CI drift
guard.**

| authored source | generated copy | sync | drift guard |
|---|---|---|---|
| `taxonomy.core.js` | `taxonomy.js` **and** `supabase/functions/_shared/taxonomy.core.js` | `scripts/sync-taxonomy.mjs` | `validate-taxonomy.mjs` |
| `supabase/functions/_shared/study-planner.core.js` | `study-planner.js` | `scripts/sync-study-planner.mjs` | `validate-study-planner.mjs` |

Both copies carry an `AUTO-GENERATED … DO NOT EDIT` banner. **This module has
no copy and will have none** — both consumers are browser modules served from
this origin, and the Node suites run the same bytes. Naming it `*.core.js`
would send the next reader looking for a `sync-stimulus-expr.mjs` and a drift
check that do not exist.

`stimulus-expr.js` also completes the family with one concern each:
**`stimulus-view.js` draws · `stimulus-editor.js` authors ·
`stimulus-expr.js` evaluates.**

Its header must say, in the family's `/* name — one-line purpose */` shape,
three things: that it is the ONE definition of the four constants and that
changing one changes **both** what Stage 0 stores and what Stage 1 draws; that
it is **not a generated file**, with the two `*.core.js` cases named so the
distinction is explicit; and that it **depends on nothing**, which is what
keeps the layering acyclic.

##### 3 · API compatibility, LOCKED

**`stimulus-editor.js` keeps re-exporting the expression API** — `normalize`,
`parse`, `sampleFunction`, `SAMPLES`, `DP`, `MAX_BRANCHES`, `MIN_POINTS` and
`FUNCTION_NAMES`, which are **8 of its 11 exports** — so its public surface is
unchanged. **`tests/stimulus-editor.test.mjs` is NOT modified by this
decision**, and its **194 checks remain the regression guard** for Stage 0
behaviour: an extraction that changed behaviour would turn them red.

##### 4 · The missing-evaluator contract, LOCKED

> **The evaluator is a required dependency of the renderer, not an optional
> enhancement.** Five clauses; the first makes the third unreachable in any
> shipped page.

- **C-1 · Static contract.** Every HTML page containing
  `<script src="stimulus-view.js">` must also contain
  `<script src="stimulus-expr.js">`. A contract test asserts it over the page
  sources, with a **detector-fires guard** — a page with the tag removed must
  make the test go red. Deterministic, no browser, cannot flake.
- **C-2 · Resolution is lazy, at call time** — `require()` under Node,
  `window.StimulusExpr` in the browser. This is the house pattern, stated at
  `taxonomy-compat.js:16`: *"Taxonomy is resolved lazily from the global, so
  load order never matters."* **No page needs its scripts reordered**, and
  `stimulus-view.js` stays where it sits.
- **C-3 · Loud and distinguishable.** A string `expr` met with no evaluator is
  a **deployment fault, never an undrawable expression**. The renderer writes
  ONE developer-facing `console.error` reading exactly *"Stage 1 expression
  evaluator is missing: load stimulus-expr.js before rendering expression
  curves."*, and marks the note it emits with
  **`data-fault="missing-evaluator"`** — the existing `sv-note` class, plus a
  dedicated `data-` attribute. **That attribute is what distinguishes the
  deployment fault from U-1/U-4 rule 3's** *"defined by a formula and is not
  drawn here"*; the two must never be confusable, and the distinction **adds
  no renderer class token and no CSS rule**.
- **C-4 · Correct output is never withheld.** A curve carrying **both** `expr`
  and drawable `points` still draws its points when the evaluator is absent —
  that output is correct, and refusing it would turn a dependency fault into a
  content regression. The fault is still caught, by C-1 before it ships and by
  C-3 at runtime.
- **C-5 · Points-only content is untouched**, evaluator or not. Measured: the
  live corpus — 12 stimuli, 5 plots, 6 curves — carries **zero** `expr`, so a
  missing evaluator cannot affect any stimulus in production today.

**The mechanism is borrowed; the posture is inverted.** C-2 takes
`taxonomy-compat.js`'s lazy resolution but **not** its graceful degradation.
That module degrades quietly because a display name has an honest fallback —
the legacy string. A missing evaluator has no honest fallback for an expr-only
curve: the only one available is a message that lies about the cause.

**Why this does not make the renderer page-dependent.** The renderer's rule is
one function of `(spec, evaluator-present)`, and **C-1 guarantees
`evaluator-present` is true on every page that loads the renderer** — so across
every shipped configuration the renderer behaves identically. The
evaluator-absent branch is not a second rendering mode; it is an assertion that
can only fire in a build C-1 rejects. **C-1 is what lets C-3 be loud without
being a variant.**

**Why U-1/U-4 survives intact.** Rule 1 is unchanged and needs the evaluator,
which C-1 guarantees. **Rule 2 is unchanged and NOT extended** — C-4 lets
points draw with no evaluator, but that is a *different condition* from "expr
not drawable", and the contract states the distinction so no later reader
collapses them. Rule 3 keeps its exact wording and meaning, and C-3 gives the
deployment fault a **different** marker — which is precisely what stops a
missing script masquerading as an undrawable formula. Rules 4 and 5 are
untouched.

##### 5 · The implementation boundary

Create:

1. **`stimulus-expr.js`** — lines 34-263 of today's `stimulus-editor.js`.

Modify:

2. **`stimulus-editor.js`** — remove the extracted half, depend on the
   evaluator, re-export per §3. *This is a Stage 0 file; exit criterion 7
   permits it because it pins behaviour, not location.*
3. **`stimulus-view.js`** — C-2 resolution, the U-1/U-4 render path at U-5's
   constants, C-3's marker.
4. **`exam.html`** · 5. **`teacher-exams.html`** ·
   6. **`teacher-homework.html`**
   — one `<script src="stimulus-expr.js">` tag each. Order is free by C-2.

**Six files, and no seventh — because the marker is an attribute, not a
class.** A new `sv-` class would have cost two further edits, and the cost was
measured, not guessed: `tests/renderer-css-parity.test.mjs:65` asserts **`the
renderer emits 30 class tokens`** as a hard count derived from the renderer's
stripped source, and all three pages must carry a CSS rule for every token — so
an `sv-fault` class would make that count **31** and need a rule on all three
pages, or CI goes red on both grounds. `data-fault="missing-evaluator"` carries
the same semantic distinction for none of that:
**`tests/renderer-css-parity.test.mjs` and the pages' CSS do not change for
this distinction at all.**

**The attribute's NAME is load-bearing, and that was measured rather than
reasoned.** The suite derives its token list with `/\bsv(?:-[a-z0-9-]+)?\b/`
over the **whole stripped source**, not over class attributes — so the obvious
name **`data-sv-fault` would still be counted as the token `sv-fault`** and
would carry the full cost anyway. Measured: `data-sv-fault` matches,
`data-fault` and `data-stimulus-fault` are clean. Anything containing `sv-`
is not.

Weight, measured: `exam.html`'s local JS goes **144,025 → 154,583 bytes
(+7%)**; `teacher-homework.html` is **net zero**, because the editor shrinks
26,482 → 15,924 by exactly what the new module carries.

**Tests are a later implementation step and are not part of this closure** —
the `stimulus-expr.js` suite, C-1's static contract, and U-1/U-4's M-1…M-9
alongside U-5's D-1…D-7.

##### 6 · Still open

**U-3 remains OPEN**, and this decision survives it either way: if U-3 later
restricts Stage 1 to staff surfaces, `stimulus-expr.js` is still the right
module and `exam.html` simply does not load it — whereas option A would have
shipped the authoring editor to students for nothing. C-1's rule would then
narrow from *every page loading the renderer* to *every page loading the
renderer that may meet an `expr`*, and would need re-stating.

**V-1 remains OPEN and unfixed.** The grammar is consumed, not extended.

#### 16.10.13 · U-3 CLOSED — which surfaces Stage 1 reaches, and when it ships (2026-09-05)

Read-only audit, then a decision. No code, no test, no HTML, no schema.

##### The policy, LOCKED

> **U-3 (CLOSED) · Policy A.** Stage 1 reaches **every page that loads
> `stimulus-view.js`** — `exam.html`, `teacher-exams.html` and
> `teacher-homework.html`. **There is no source-level exception inside
> `exam.html`**: its `platform`, `teacher` and `homework` paths use the same
> renderer contract, and Stage 1 stays consistent across all three.

**[design decision]** — the roadmap names no surface scope, and the rejected
alternative is recorded below.

**Consistent with U-2 by construction.** §16.10.12's **C-1** already requires
that every page loading `stimulus-view.js` also load `stimulus-expr.js`.
Policy A is that rule and nothing more; it needs no new machinery, and it is
why §16.10.12 §6 could say this decision survives U-3 either way.

##### What the surface inventory actually is

**`exam.html` is the SINGLE student delivery surface** for all three systems —
platform exams, teacher exams and homework. There is no `homework.html` and no
separate student-exams page; the repository has 53 root pages and neither
exists on `main`. `dashboard.html` carries a summary card whose one button
reads *"Open homework and exams"* and whose own comment gives the reason:
*"two doors into the same list is how a student ends up believing there are
two lists."*

`exam.html` has exactly **three** `StimulusView.render()` call sites, and
**none of them branches on `S.source`**:

| line | function | serves |
|---|---|---|
| 891-892 | `hwRender()` | homework, sitting screen |
| 1051 | `hwReviewItem()` | homework, review screen |
| 1196-1197 | `renderItem()` | **platform AND teacher**, question screen |

`S.source` dispatches start / save / submit (`:434`, `:444`, `:492`) and
**never rendering**. Platform and teacher already share one render site.

The staff previews are `teacher-exams.html:508-509` and `:606`, and
`teacher-homework.html:941-942` and `:1069` — and they call the identical
renderer entry point. **Teacher exam and homework previews therefore get the
same Stage 1 behaviour as delivery**, which is the property this policy exists
to keep.

##### Why Policy B is rejected

- **Page-level ("staff-only") is incoherent here.** Withholding
  `stimulus-expr.js` from `exam.html` would withhold expression rendering from
  **teacher-authored papers on the very screen students sit them**. A teacher
  would author a formula, see it drawn in preview, publish it — and their
  student would be told it *"is not drawn here"*. That is not staff-only; it is
  a **preview/delivery mismatch**.
- **Source-level branching inside `exam.html`** would require *new* branching
  at render sites that have none today, and would thread `S.source` into
  `renderItem()` for the first time — making U-1/U-4 source-dependent.
- **Per-call configuration** is **option E, already rejected in §16.10.12**: it
  makes the same spec draw differently by page wiring, contradicts one
  renderer, and makes U-5's **D-4** untestable as a global property.

##### Deployment timing, LOCKED

> **Stage 1 ships as ONE increment after U-3 closes.** The U-2 extraction is
> **not** shipped separately as a production increment — U-2 was a design
> decision, and the extraction has not been written.

**[design decision]** — and the reason it is safe to ship as one thing is
measured, not assumed.

**Deployment is behaviourally zero-impact on the current production corpus.**
Measured on production 2026-09-05:

| table | rows | plots | curves | **with `expr`** | with `points` |
|---|---|---|---|---|---|
| `exam_stimuli` (platform) | **33** | 15 | 17 | **0** | 17 |
| `teacher_exam_stimuli` | **0** | — | — | — | — |
| `teacher_homework_stimuli` | **0** | — | — | — | — |

And nothing is sittable at all: **0 published** `exam_forms`, **0 published**
`teacher_exams`, **0 published** `teacher_homework`. So Stage 1 changes the
rendered output of **zero live rows on every one of the five surfaces** — not
because the feature is inert, but because there is no `expr` in the database
and nothing published for a student to open.

*(The 12 / 5 / 6 figures quoted in §16.10.4 and §16.10.12 are
`tests/fixtures/stimuli.json`, a verbatim subset. Production is 33 / 15 / 17.
Both are 100% points-only, so both statements hold.)*

**It is not hypothetical, though.** All three stimulus tables carry the
identical constraint — `CHECK ((spec IS NULL) OR exam_stimulus_spec_ok(kind,
spec))` — which permits `expr` alone (§16.10.10). So **expr-only content can
reach a student surface today**, hand-written through either staff page's JSON
path, and it draws the *"defined by a formula and is not drawn here"* note.
That is the gap Stage 1 closes, and it is reachable now.

Storage is untouched either way: U-1/U-4 rule 5 keeps `expr` **and** `points`
stored, so `git diff -- supabase/` stays zero (§16.10.7 exit criterion 8), and
points-only content is unchanged by U-1/U-4 rule 4 and §16.10.12's C-5, with
**M-3** as the assertion.

##### I-6 — recorded, NOT taken into scope

`teacher-exams.html` still has **no Stage 0 visual editor**: it authors specs
through a **`Spec (JSON)` textarea** (`:227-228`), because Stage 0 was applied
to `teacher-homework.html` only — which has the visual editor (`:676`) **and**
an Advanced JSON path (`:384`). So the exam page reaches `expr` only through
raw JSON.

Stage 1 arguably makes **I-6** (giving that page the visual editor) more
pressing. **It is recorded here and nothing more.** I-6 is Stage 0 scope, it is
not modified, and **Stage 1's scope is not expanded to include it.**

##### Still open

**V-1 remains OPEN and unfixed** — the storage-layer defect of §16.10.10.
**I-6 is unchanged.** The grammar is consumed, not extended.

**Every Stage 1 design decision is now closed**: O-1, O-2, O-4, U-1, U-2, U-3,
U-4 and U-5. What remains before implementation is approval to write code, not
a decision to take.

---

## 17 · The Unified Student Assessment Shell — DEFINITION (2026-09-05)

**This section authorizes no code.** No module, no page edit, no stylesheet, no
schema, no migration, no deploy. It is the specification the next increments are
measured against, and nothing in it has been built.

**REVISION 1 — 2026-09-05, on review.** Approved with three decisions, each
applied below and nowhere else: **§17.10.2** is LOCKED (the student shell carries
no `checkMode()` and no replacement bypass); **W-1** stays OPEN and now also
forbids any animation or timing change in Increments 1 and 2; **W-5** is CLOSED
— one unified footer, §17.12.1. Every measurement, quotation and provenance
label from the original section is unchanged; nothing was re-measured and
nothing was re-worded to fit.

### 17.0 · Why this section exists

`assignments.html` is the single student delivery surface for **three** sources
(§17.6), and a full assessment engine — sixteen modules, 269,181 bytes — exists
on an unmerged branch and serves none of them. The two were built eighteen
months and one architecture apart, and the question "which student test
experience is the real one?" currently has two answers. This section makes it
one.

**Provenance, marked throughout.** Every clause carries one of five labels, so a
later reader can tell a measurement from a decision from a gap:

- **[measured]** — read today from the live database, the working tree, or the
  old branch through `git show`. The command that produced it is named or the
  number is exact.
- **[existing]** — already true of a shipped surface: `assignments.html` at
  `main`, or the old engine on `origin/claude/mock-exam-enhancement-nnwb48`.
  Stated, not created.
- **[design decision]** — a choice this section takes that the repository does
  not determine. It **adds a requirement**, and the alternative it rejected is
  recorded beside it.
- **[user constraint]** — imposed in the approval for this increment, quoted.
  Not negotiable by a later reading.
- **OPEN** — a genuine gap. §17.12 lists them. **None is filled by guessing**,
  and the shell is not complete while one is being answered implicitly by code
  rather than explicitly by a decision.

### 17.1 · What was measured, and how

Every number below was read on 2026-09-05 against the live project, `main`, or
the old branch. None is recalled.

| Fact | Value | How |
|---|---|---|
| `assignments.html` | 1,349 lines | `wc -l` |
| Old-engine modules | 16 JS files, **269,181 B**, plus `exam-surface.css` (17,273 B) and `exams.html` (25,840 B) | `git cat-file -s` per file |
| Modules referenced on `main` | **zero** — no file on `main` contains the string `SiExam` | `grep -rln SiExam --include=*.html --include=*.js .` |
| Audio assets on `main` | **absent**. `assets/exam-ambience/voice-1…7.mp3` exist only on the old branch; `main` carries 7 assets, none audio | `git ls-tree -r --name-only main -- assets` |
| `exam_integrity_events` | **LIVE**, 9 columns, RLS on, 2 policies, **40 rows**, `authenticated` holds INSERT | `pg_class` / `pg_policy` / `count(*)` |
| …its `attempt_id` | **no foreign key.** The only FK on the table is `user_id → auth.users` | `pg_constraint` |
| …its `exam_code` | `text`, CHECK length 1..40 | `pg_constraint` |
| `exam_forms.exam_code` in production | `ACT_MATH`, `EST_MATH_1`, `SAT_FULL` — all `draft`, one form each | `select … group by` |
| Registry exam codes | `SAT_MODULE_1`, `SAT_MODULE_2`, `SAT_FULL`, `EST_MATH_1`, `EST_MATH_2_L1`, `ACT_MATH`, `PRACTICE` | `grep "code: '"` on `exam-registry.js` |
| Calculator providers named by the registry | **`provider: null` on all seven**, so `hasRenderableCalculator()` is false for every exam | `grep -n "provider:"` — 7 hits, all null |
| CSP on `main` | names **no** Desmos origin in any directive | `vercel.json` |
| CSP on the old branch | names `https://www.desmos.com` in **five** directives: `script-src`, `style-src`, `font-src`, `img-src`, `connect-src` | `git show …:vercel.json` |
| `api/desmos-config.js` | exists on the old branch, **absent from `main`** | `git ls-tree` both refs |
| CI at HEAD | **74/74 green** | `node tests/run-all.mjs` |
| `.ex-*` / `.xc-*` classes in `assignments.html` | **zero** | `grep -cE 'class="[^"]*\b(ex\|xc)-'` |

### 17.2 · The shell's job, stated exactly

> **The Unified Student Assessment Shell is the one surface a student sits an
> assessment in, whatever produced it.** It owns the frame — identity, timing,
> navigation, progress, tools, and the item viewport — and it owns none of the
> content, none of the delivery, and none of the grading.

**[design decision]** The shell is a **frame**, not an engine. The alternative
considered and rejected: port `exams.html` and make it the student surface, with
`assignments.html`'s RPC delivery bolted onto it. Rejected because
`assignments.html` already carries the delivery layer for all three live sources
(§17.6) and the old engine's delivery layer (`exam-delivery.js`,
`exam-form-source.js`) reads the Spine tables that the RPCs replaced — adopting
it would mean re-deriving access rules the database already enforces, which
§15.14 forbids and which the exam player's own comment forbids in as many words:
*"teacher_exam_start() calls teacher_exam_can_start() itself; the page never
re-derives that rule and must not start trying to."* **[existing]**

**Three anti-goals**, each the negation of something the shell could plausibly
grow into:

1. **The shell never decides who may sit.** **[existing]** Only `can_start` /
   `can_open` turns a row into a Start button, and those come from the database.
2. **The shell never grades and never writes an analyzer table.** §17.9.
3. **The shell is not a second visual system.** §17.8. It renders figures
   through `window.StimulusView.render()` and through nothing else — the same
   constraint §16.10.3 puts on Stage 1, extended to the frame around it.

### 17.3 · Shell regions

Seven regions. Each has exactly one owner, and the owner is either the shell or
the source — never both.

```
┌─ R1 BAR ─────────────────────────────────────────────────┐
│ identity · status · exit                                 │
├─ R2 TOOLBAR ─────────────────────────────────────────────┤
│ [navslot]        [toolslot]        [timeslot]            │
├─ R3 STAGE ───────────────────────────────────────────────┤
│  ┌─ R4 ITEM ────────────────────────────────────────┐    │
│  │ header · stimulus · prompt · response            │    │
│  └──────────────────────────────────────────────────┘    │
├─ R5 FOOTER ──────────────────────────────────────────────┤
│ prev · palette · next · submit                           │
└──────────────────────────────────────────────────────────┘
   R6 OVERLAY   — document.body level, above everything
   R7 AMBIENT   — no DOM at all
```

| Region | Owner | Contents | Present when |
|---|---|---|---|
| **R1 · Bar** | shell | title, subtitle, exit affordance | always |
| **R2 · Toolbar** | shell frame, capabilities fill the slots | three named slots: `navslot`, `toolslot`, `timeslot` | always; slots may be empty |
| **R3 · Stage** | **source** | whichever view the source is showing — chooser, sitting, result, review | always |
| **R4 · Item** | shell | question header, stimulus mount, prompt, response control | during a sitting only |
| **R5 · Footer** | shell — **exactly one**, §17.12.1 | previous, question palette, next, submit, and named slots a source may fill | during a sitting only |
| **R6 · Overlay** | capability | the tool panel and its scrim; anything modal | on demand |
| **R7 · Ambient** | capability | audio, ambience, integrity listeners — **no element anywhere** | on demand |

**R7 is not a metaphor.** **[measured]** `exam-audio.js` and `exam-ambience.js`
contain **no reference to `document` at all** — zero matches for `document.` in
either. `exam-integrity.js` reaches it once, as `root.document`, purely to bind
`copy` / `contextmenu` / `visibilitychange`, and binds `beforeprint` / `blur` /
`focus` on the global; it **selects no element**. A capability in R7 attaches to
the *session*, not to the page, which is why it survives the source re-rendering
R3.

**R2 replaces two things that exist today and disagree.** **[existing]**
`assignments.html` renders its clock as `#timer` inside `.bar` and duplicates its
whole footer for homework (`#footer` and `#hwFooter`, `#palette` and
`#hwPalette`, four navigation buttons where two would do). `exams.html` renders
`#navslot`/`#calcslot`/`#timeslot` in one `.ex-bar` and has one `#view`. The
shell takes the slot model and **[design decision]** renames `calcslot` to
`toolslot`: the slot is a place for a tool, and naming it for the calculator is
what makes a second tool a rewrite. The alternative — keep `calcslot` for
drop-in compatibility with `exam-calculator-launcher.js` — is rejected because
that module keys on the **attribute** `[data-si-calculator-slot]` and not on the
id (§17.4), so nothing is gained by the narrower name.

### 17.4 · Mount contracts

Every existing module was read for its DOM coupling. Three tiers came out, and
they are a measurement, not a taxonomy chosen in advance.

**Tier A — no element coupling (12 modules).** **[measured]** Zero matches for
`querySelector`, `getElementById` or `getElementsByClassName`, **and** zero for
`document.body` / `.head` / `.documentElement`. `exam-ambience`, `exam-audio`,
`exam-calculator`, `exam-calculator-config`, `exam-chrome`, `exam-delivery`,
`exam-form-source`, `exam-graph`, `exam-graph-zero`, `exam-integrity`,
`exam-registry`, `exam-stimulus`.

Several of them call `document.createElement` — `exam-stimulus` 9 times,
`exam-graph-zero` 6, `exam-chrome` 2 — which is **building**, not coupling. A
module that creates an element and hands it back constrains nothing about where
it goes; that distinction is the whole tier.

`exam-chrome.js` is the pattern the shell adopts wholesale: `Timer(opts)` and
`Navigator(opts)` are **factories that build an element and return it** —

```js
return { el: wrap, set: fn, isHidden: fn, setHidden: fn };          // Timer
return { el: wrap, setCurrent: fn, setState: fn, setOpen: fn, … };  // Navigator
```

— and the caller decides where `.el` goes. Neither reads the document.

**Tier B — document-anchored (3 modules).** **[measured]**
`exam-calculator-launcher.js` scans `[data-si-calculator-slot]`, injects
`#si-calc-style` into `document.head`, and appends its panel to `document.body`.
`exam-workspace.js` touches only `document.body.classList` (the
`si-calc-panel-open` flag). `exam-graph-desmos.js` appends its API `<script>` to
`document.head` and looks it up by the id `si-desmos-api` so a second open does
not append a second tag. All three are portable because each anchors to a **data
attribute or its own id**, never to the host page's structure.

**Tier C — class-coupled (1 module).** **[measured]**
`exam-reviewer-bar.js` hard-codes `.ex-shell` (its insert target, falling back to
`document.body.firstChild`) and `.ex-card` (the element it runs its KaTeX
notation check against), and it writes `data-theme` and two custom properties
onto `document.documentElement`.

**THE MOUNT RULE — [design decision].**

> **The shell admits Tier A and Tier B unchanged. A Tier C module is admitted
> only after its selectors become parameters.** No module is modified to make it
> fit; a module that does not fit is either parameterised or excluded, and which
> one is a decision recorded at the time.

**Two modules are excluded outright, and this is the boundary the user set.**

- `exam-delivery.js` and `exam-form-source.js` — the old Spine delivery layer.
  `assignments.html` already owns delivery for all three sources through RPCs.
  Importing these would create a second delivery path to the same tables.
  **[user constraint]** *"Do not modify the existing SAT/ACT/EST engine"* — and
  the cleanest way to honour that is to leave its delivery layer where it is.
- `exam-reviewer-bar.js` — an **admin** tool for reviewing draft forms on
  `exams.html`, gated behind `has_role_at_least('admin')` RLS. It is not part of
  a student's experience and the student shell does not carry it.

**Note on `exam-delivery`, for whoever reads the test list.** **[measured]**
`tests/exam-delivery.test.mjs` exists on **both** branches and tests **different
things**: on `main` it reads three migration files
(`20260830e/f/y_exam_delivery*.sql`); on the old branch it reads
`exam-delivery.js`. Bringing the module over under its current name would
collide with a live suite. Since the module is excluded, this is recorded as a
hazard avoided rather than one to solve.

### 17.5 · The capability contract

A capability is anything the shell hosts that is not the item itself. **[design
decision]** Every capability declares the same five things, and the shell
refuses to host one that cannot:

| Field | Meaning |
|---|---|
| `id` | stable string, used in tests and in no user-visible text |
| `region` | which of R1…R7 it occupies |
| `status()` | `{ ready:boolean, state:string, detail:string }` — **why**, not just whether |
| `mount(el, opts)` / `unmount()` | for a capability with a region; omitted for R7 |
| `available(ctx)` | may this session have it at all — asked before `status()` |

`status()` returning a **reason** rather than a boolean is lifted directly from
`exam-graph-desmos.js`, where it already carries four states
(`no-key` / `no-tier` / `trial-misuse` / ready) each with a sentence a student
can read **[measured]**. The shell generalises it because a capability that can
only say "no" produces a UI that can only say nothing, and §17.10 depends on the
difference.

**`available()` and `status()` are two gates, deliberately.** `available()`
answers *may this session have it* (policy, entitlement, licence);
`status()` answers *can it run right now* (configured, loaded, sized). Collapsing
them is what lets a licence question be answered by a loading spinner.

### 17.6 · The source model

**[measured]** `assignments.html` dispatches on `S.source`, which takes exactly
three values, and the three do **not** share one call shape:

| Source | `S.source` | start / save / submit | Timed | Resume key |
|---|---|---|---|---|
| Platform sections | `'platform'` | `exam_start` · `exam_save_response` · `exam_submit` | yes | `exam_req_<id>` |
| Teacher exams | `'teacher'` | `teacher_exam_start` · `teacher_exam_save_response` · `teacher_exam_submit` | yes | `exam_req_t_<id>` |
| Teacher homework | `'homework'` | six separate H4/H5 RPCs | **no** | — |

Platform and teacher share a signature — both carry `p_ms_delta` and `p_visit`.
Homework does not, and the page says why in its own words: *"homework never goes
through start/save/submit above: those dispatch on `S.source` and carry the
exam's visit and time-delta arguments, which homework has no column for and no
business recording."* **[existing]** `teacher_homework` has **no
`duration_minutes` column** at all **[measured]**, so untimedness is a schema
fact and not a UI preference.

**THE SOURCE ADAPTER — [design decision].** The shell talks to one interface and
the three sources implement it. The adapter, not the shell, knows which RPC to
call.

```
source = {
  id,                       // 'platform' | 'teacher' | 'homework'
  list(),                   // rows for the chooser
  start(id, reqId),         // → attempt
  save(questionId, answer, opts),   // opts may be ignored by a source
  submit(attemptId),        // → summary
  capabilities,             // which of §17.5 this source may have — §17.9
  resumeKey(id),            // namespaced, never shared
}
```

`save(…, opts)` takes an options object rather than positional `msDelta, visit`
precisely so that homework can ignore what it has no column for, instead of
being handed zeros that look like measurements.

**The resume key stays namespaced.** **[existing]** `exam_req_` and
`exam_req_t_` are already distinct because a teacher exam id and a platform
section id are both uuids, and one key space would let a refresh resume the
wrong sitting. The shell inherits that rule and extends it to any fourth source.

#### 17.6.1 · `exam_code` means two different things — a hazard, measured

**[measured]** The identifier `exam_code` exists in two table families with two
incompatible meanings:

| Column | Meaning | Example |
|---|---|---|
| `exam_forms.exam_code`, `exam_integrity_events.exam_code`, `SiExamRegistry` codes | **exam type** — which test this is | `SAT_FULL` |
| `teacher_exams.exam_code` | **share code** — the secret a student types to request access | a 12-character code |

Production confirms the first: `exam_forms` holds exactly `ACT_MATH`,
`EST_MATH_1`, `SAT_FULL`, which are three of the registry's seven codes, so the
registry vocabulary and the database vocabulary already agree with **no mapping
table**.

**The rule — [design decision].** *The shell never passes a teacher exam's
`exam_code` anywhere an exam-type code is expected.* Two concrete consequences,
and both are why the rule is written down before any code exists:

1. `exam_integrity_events.exam_code` is **admin-readable** (`exam_integrity_events_admin_read`)
   **[measured]**. Writing a teacher's share code into it would publish a
   student's join secret into an admin report.
2. `SiExamRegistry.get(code)` on a share code returns `null`, and every consumer
   of a null policy degrades silently — no calculator, no announcement schedule,
   no answer convention — which looks like a configuration problem and is
   actually a type confusion.

**A teacher exam and a homework have no exam-type code at all.** What the shell
passes for them is **OPEN (W-3)**.

### 17.7 · Integrating what already works

The shell **preserves** these; it does not re-implement them. Each is live on
`main` today and verified deployed. **[existing]**

| Capability | Where it lives now | Under the shell |
|---|---|---|
| Stage 1 figure rendering | `window.StimulusView.render()`, 5 call sites in `assignments.html` | R4 stimulus mount, same entry point, unchanged |
| RPC delivery, all three sources | the `api` object, §17.6 | moves behind the source adapter, same RPCs |
| Countdown + auto-submit | `startTimer()`, `.timer/.warn/.crit`, submits at zero | R2 `timeslot`, §17.8 resolves the visual conflict |
| Prev / next / palette | `#prevBtn`/`#nextBtn`/`#palette`, duplicated for homework | R5, **one** footer with named slots — W-5 CLOSED, §17.12.1 |
| Flag and review | 43 lines mentioning `flag` or `review` | R5 palette states, `Navigator`'s four states |
| Resume | `exam_req_` / `exam_req_t_` in `localStorage` | `source.resumeKey()`, §17.6 |
| Homework review screen | `#hwRev`, `.rv-*` | R3, owned by the homework source |
| Access/attach code boxes | `#codeIn` / `#hwCodeIn` | R3 chooser, owned by the source |

**Nothing in this table is a rewrite.** The shell's first increment is a frame
that these move into unchanged; an increment that changes one of them at the
same time is doing two things and is not this increment.

### 17.8 · The visual contract

**Three namespaces exist and none collides today.** **[measured]**

| Prefix | Owner | Where |
|---|---|---|
| `.sv-*` | `stimulus-view.js` | figures — the shared renderer, already parity-tested |
| `.ex-*`, `.xc-*` | old engine | `exam-surface.css` — 23 `.ex-*` (the surface) + 20 `.xc-*` (the chrome) |
| unprefixed (`.card`, `.timer`, `.choice`, `.footer`) | `assignments.html` | its own `<style>` block |

`assignments.html` uses **zero** `ex-` or `xc-` prefixed classes, so the old
engine's stylesheet can be introduced without a single collision.

**One latent hazard, named now.** Both surfaces use a `.rv-*` prefix for
different things: `assignments.html` for its homework **review** screen
(`.rv`, `.rv-box`, `.rv-exp`, `.rv-hd`, `.rv-p`, `.rv-row`) and
`exam-reviewer-bar.js` for its **reviewer** bar (`.rv-b`, `.rv-bad`, `.rv-bar`,
`.rv-flag`, `.rv-ok`, `.rv-out`, `.rv-set`, `.rv-sp`, `.rv-tag`). The two sets
are **disjoint today** — measured name by name — so nothing is broken. But a
shared prefix with no owner is how the six conflicting rules that
`tests/renderer-css-parity.test.mjs` now guards got there in the first place.
**[design decision]** The shell claims `.as-*`, adds no rule under a prefix it
does not own, and `exam-reviewer-bar.js` stays excluded (§17.4), which leaves
`.rv-*` to `assignments.html` alone.

**The pulse conflict — a real disagreement between the two surfaces.**
**[measured]** `assignments.html` styles the last minute as
`.timer.crit{…animation:pulse 1.6s ease-in-out infinite}`. `exam-chrome.js`
refuses exactly that, in a comment: *"Low time is signalled by weight and
colour, never by motion: a pulsing clock in peripheral vision is exactly the
pressure the hide exists for."* The same module ships a **hide** control, so its
position is not an aesthetic preference — it is a design taken twice.

This is **OPEN (W-1)**, and it stayed open on review. It is a
student-experience decision, the two shipped surfaces disagree, and picking one
silently while building a frame is exactly the kind of quiet reinterpretation
this process exists to prevent. **Since 2026-09-05 W-1 also carries a
constraint**: Increments 1 and 2 add no animation and change no live student
timing behaviour, and `assignments.html`'s existing `.timer.crit` rule is left
byte-identical rather than adopted or removed (§17.12, obligation 16).

**Tokens, not values.** **[design decision]** Every colour the shell sets comes
from the existing custom properties the pages already define (`--cyan-3`,
`--amber-border`, `--ink-2`, …). The old engine's injected CSS already does this
— `var(--font-mono, ui-monospace, monospace)`, `var(--cyan-soft)` — so it
inherits whichever surface it lands on rather than importing a second palette.

### 17.9 · Capability boundaries

**The analyzer boundary is the one that must not move.** **[existing]** It is
already proven at three layers and the shell adds a fourth obligation: it must
not become a way around any of them.

1. **Database.** No function names both a homework table and an analyzer table;
   no database function writes `weakness_signals` at all; only `exam_submit`
   writes `exam_mistakes` / `exam_practice_sessions`.
2. **Client.** `finish()` in `assignments.html` returns **before** every writer
   — a headless submit of a teacher paper called `ExamMistakesLogger.process`,
   `regenerateWeaknessReports` and `updateStreak` **zero** times, and the
   identical platform submit called all three.
3. **Measured end to end.** Two full graded teacher sittings moved
   `weakness_signals` / `exam_mistakes` / `exam_practice_sessions` by zero.

**THE SHELL'S OBLIGATION — [design decision].** *Analyzer writing is a property
of the source, declared in `source.capabilities`, and the shell calls no writer
directly.* Today only `platform` carries it. The alternative — the shell keeps
the `finish()` guard and branches on `S.source` — is rejected because it puts the
boundary in the frame, where a fourth source added later inherits whatever the
branch happened to say. A capability the source must **declare** cannot be
acquired by omission.

**The integrity boundary is a different question and is not decided here.**
**[measured]** `exam_integrity_events` is live, holds 40 rows, grants
`authenticated` INSERT, and its `attempt_id` carries **no foreign key** — so a
teacher-exam or homework attempt id is writable into it with no schema change at
all. That makes proctoring cheap to extend and therefore worth deciding
deliberately: whether a teacher's paper is proctored is a teacher's decision, and
neither `teacher_exams` nor `teacher_homework` has a column to hold it.
**OPEN (W-2).**

**What the shell may never do**, in one list:

- decide who may sit, or re-derive any `can_start` / `can_open` rule;
- grade, or infer correctness from anything the server did not say;
- write `weakness_signals`, `exam_mistakes`, `exam_practice_sessions`, or
  `question_records`, for any source;
- render a figure other than through `window.StimulusView.render()`;
- pass a share code where an exam-type code is expected (§17.6.1);
- present a capability whose `available()` is false in any state a student can
  interact with (§17.10).

### 17.10 · The calculator / tool mount, and the Desmos capability — RESERVED AND LOCKED

**[user constraint], quoted in full because every clause below serves it:**

> *"The unified shell must include the calculator/tool mount and the Desmos
> capability contract now, even though Desmos is not commercially licensed yet.
> The capability must be present in the architecture/UI as a disabled,
> non-selectable capability until Si Math AI has the required commercial Desmos
> licence. Students must not be able to activate, select, or launch Desmos while
> the commercial licence is absent. Do not use the internal-evaluation/trial
> tier for students. Do not expose a fake/partial calculator implementation.
> Activation must later be a configuration/licence decision, not a rewrite of
> the shell. Keep the existing licence gate from the old exam engine; do not
> bypass it."*

#### 17.10.1 · Four independent gates, all closed today

The licence gate already exists and is **not one check**. Each of these was
measured, and each independently prevents Desmos from reaching a student:

| # | Gate | Where | State today | Measured by |
|---|---|---|---|---|
| **G1** | `provider: null` on **all seven** registry entries → `hasRenderableCalculator()` false → `describe().inApp` false → no control renders | `exam-registry.js` | closed | `grep -n "provider:"` — 7 hits, every one `null` |
| **G2** | The config endpoint refuses without a Supabase session (401), refuses `trial` + `studentFacing`, and returns `{config:{}}` when `SI_DESMOS_CONFIG` is unset | `api/desmos-config.js` | closed — and the **file does not exist on `main`** | `git ls-tree main` |
| **G3** | `status()` returns `no-key` / `no-tier` / `trial-misuse` before `mount()` will run; `mount()` rejects on a non-ready status | `exam-graph-desmos.js` | closed | source read |
| **G4** | CSP on `main` names no Desmos origin, so the API script cannot load even with a key | `vercel.json` | closed | directive-by-directive comparison, §17.1 |

**G2 and G3 are the same refusal made twice, deliberately** — the server file
says so: *"Two independent refusals, because the client-side one lives in code a
browser could be serving a stale copy of."* **[measured]** The shell preserves
both. Neither is redundant and neither is removed as a simplification.

**The keeping rule — [design decision].** *The shell adds no gate of its own and
removes none. It reads G1 and G3 through `available()` and `status()`, and it
never mounts a provider it did not ask.*

#### 17.10.2 · One student-reachable bypass — a defect, named

**[measured]** `exam-calculator-launcher.js` computes

```js
function available(code) { return policyAllows(code) || overridden(); }
function overridden()    { return checkMode() || reviewer; }
```

and `checkMode()` reads `?desmos-check=1` from the query string, **persists it in
`sessionStorage`**, and returns true for the rest of the tab. The module's own
comment concedes the reach: *"the flag is already typeable by anyone signed
in."*

Under today's four gates a student who typed it would get a **rendered button**
that opens a panel showing a `no-key` card — nothing launches. But the user
constraint is about **activate, select, or launch**, and a clickable calculator
control is the first two. It is also a bypass of exactly the gate the same
constraint says not to bypass.

**THE RULE — LOCKED 2026-09-05. [user constraint]**

> **The unified student assessment shell must not expose, carry, or depend on
> `checkMode()`, `?desmos-check=1`, or any student-reachable override path.** A
> student-facing surface computes `available()` from the exam's own policy
> alone. **The existing licence gate is kept as defense-in-depth, and is not
> replaced by another student-side bypass or workaround.** Internal evaluation,
> if it is ever needed, is a staff-only affordance decided as its own increment
> with its own approval — never a query string, a session flag, a
> `localStorage` key, a hash fragment, or a global someone can set from a
> console.

Two things this rule is careful to keep apart, because collapsing them is how a
gate gets removed while everyone believes it was kept:

- **The four gates of §17.10.1 stay.** They are not superseded by this rule and
  not made redundant by it. Removing the override does not license removing a
  gate; the gates are the licence boundary and the override was a hole in it.
- **"No replacement" is a requirement, not an aspiration.** The obvious
  substitutions — a build-time flag, a `?calc=1`, a role read done in the
  browser, a `window.SI_CALC_TEST` — are all the same defect wearing different
  clothes, and §17.13's obligations 4, 12 and 14 exist to make each of them fail
  a test rather than pass a review.

The alternative — port the launcher verbatim and rely on G2/G3/G4 to make the
override harmless — is rejected because it makes a licence boundary depend on
three other gates staying shut, and because a control a student can click is a
control a student has selected whatever happens next.

#### 17.10.3 · How a locked capability presents

**[design decision]** The reserved tool mount is real in the architecture and
inert in the UI. The distinction the shell draws:

| | Disabled capability | Absent capability |
|---|---|---|
| Region R2 `toolslot` | **exists**, empty | exists, empty |
| Control rendered | **none** | none |
| Focusable / clickable | **no** | no |
| In the DOM as a disabled button | **no** | no |
| Named to the student | **no** | no |

**A locked capability renders nothing at all** — not a greyed button, not a
tooltip, not a lock icon. Three reasons, and the first is the user's:

1. *"non-selectable"* is met by absence and only approximately by `disabled` — a
   `disabled` button is still in the accessibility tree, still announced, and
   still a thing a student can try to press.
2. **[measured]** `describe()` already reaches the same conclusion in its own
   comment about `inApp`: *"Always false today. When a licensed provider is
   registered this becomes true and the page may offer a control; until then it
   is what guarantees no button appears."* The shell is not inventing a posture;
   it is keeping one.
3. Naming an unlicensed tool in a student-facing UI is the marketing use
   §6.b of the API terms does **not** license. Absence has no trademark
   question.

**What a student does still see is the policy badge that exists today**
**[existing]** — `#qCalc`, *"Calculator allowed"* — because that is a statement
about the **exam**, not an offer of a tool, and it is already live and correct.

**Reaffirmed on review, 2026-09-05 — [user constraint].** Three prohibitions
that were quoted in this section's preamble are now approved decisions in their
own right, and none of them is a default that a later increment may reconsider
without a new approval: **no trial tier for students**, **no greyed or disabled
calculator control**, and **no partial or fake calculator implementation**.
Desmos remains **RESERVED, NON-SELECTABLE and NON-LAUNCHABLE** until a
commercial licence and its configuration exist. Activation, when it comes, is
configuration- and licence-driven and requires **no shell architecture
rewrite** — §17.10.4 is the whole list, and it is four steps with no fifth.

#### 17.10.4 · What activation later requires — and does not

**[design decision]** Activation must be *configuration*, so this is the whole
list, written now so a later reader can check that no rewrite crept in:

1. Set `SI_DESMOS_CONFIG` with `tier: "commercial"` in the Vercel environment.
2. Bring `api/desmos-config.js` onto `main` — it does not exist there.
3. Add `https://www.desmos.com` to the five CSP directives (§17.1).
4. Name `provider: 'desmos'` on whichever registry entries the licence covers.

**There is no fifth step, and that is measured.** **[measured]**
`exam-graph-desmos.js` **self-registers** on load —
`root.SiExamCalculator.registerProvider('desmos', root.SiExamGraphDesmos)` is
the last thing its own IIFE does, and `exam-graph-zero.js` does the same. So no
wiring code exists to write, and registration is **not** a gate: G1 is, because
`isInAppAvailable()` needs the registry to *name* a provider before the
registered one can be looked up. Loading the file changes nothing on its own.

**Not on the list, and this is the test of the design:** no change to the shell,
no change to any region, no change to the source adapter, no change to
`available()`/`status()`, no new stylesheet, no new page. If activation ever
needs one of those, the shell was specified wrong.

**Three things activation must never be:** the trial tier served to students
(§2.a, refused in two places), a partial or hand-written calculator standing in
for the real one, or the licence question answered by a UI flag.

#### 17.10.5 · The reserved contract, in the shell's own terms

```
capability 'calculator':
  region     R2.toolslot (control) + R6 (panel)
  available  → source.capabilities.calculator
               && SiExamCalculator.describe(examTypeCode).inApp     // G1
               // and nothing else — no query string, no session flag
  status     → provider.status()                                    // G3
  mount      → provider.mount(panelEl, opts)
  unmount    → provider.unmount()
  locked     → available() === false ⇒ render nothing (17.10.3)
```

`examTypeCode` is the exam-**type** code of §17.6.1, never a share code. For a
source that has no exam-type code, `available()` is false — **OPEN (W-3)**
decides whether that stays the answer.

### 17.11 · Architecture constraints

All **[existing]**, all inherited, none new:

1. **No build step, no bundler, no `package.json`.** The same bytes run in the
   browser, in Deno and in Node under CI. The shell is a plain IIFE assigning to
   `window` **and** `module.exports`, like every module already in the tree.
2. **Tests execute the real shipped source** through `tests/_source.mjs`, never a
   paraphrase.
3. **CI discovers suites by `readdirSync`** — a new `*.test.mjs` is picked up
   with no registration.
4. **Frozen files stay frozen.** `mock-exam.html`, `weakness.html`, `focus.html`,
   `regenerate-reports.js`, `exam-mistakes-logger.js`, `taxonomy.js`,
   `taxonomy.core.js`. The shell touches none of them.
5. **No schema, no migration, no RPC.** The shell is client code. Any increment
   that turns out to need a migration stops and asks.
6. **CDN dependencies stay pinned with SRI.**
7. **Load order must not matter.** Modules resolve their dependencies lazily from
   the global at call time — the `taxonomy-compat.js` pattern, and the pattern
   Stage 1's `EXPR()` shim already uses.

### 17.12 · What this section does NOT decide

**Four gaps remain open.** W-5 was decided on review and is recorded closed in
§17.12.1. Each of the four below is a real decision, and **none is answered
here**.

| | Gap | Why it is open | Cost of guessing |
|---|---|---|---|
| **W-1** | Does the last minute pulse? | The two shipped surfaces disagree, and `exam-chrome.js`'s refusal is reasoned and paired with a hide control (§17.8) | A student-experience decision taken by whichever file was copied first |
| **W-2** | Is a teacher's paper proctored? | `exam_integrity_events` accepts any attempt id with no FK, so it is cheap — and neither teacher table has a column to record the teacher's choice (§17.9) | Proctoring students because it was easy, without the teacher deciding |
| **W-3** | What exam-type code does a teacher exam or a homework carry? | There is none, and `exam_code` on `teacher_exams` means something else entirely (§17.6.1) | A share code written into an admin-readable log |
| **W-4** | Does the shell ship as one page or one module? | `assignments.html` is 1,349 lines with its logic inline; the shell could be a module it loads or a restructure of the page | A 1,300-line rewrite entering as an "increment" |

**W-1 stays open by decision, not by neglect — [user constraint], 2026-09-05:**

> *"Do not choose or implement a pulsing-clock behaviour yet. Do not add
> animation or change live student timing behaviour in Increment 1 or
> Increment 2. Record W-1 as an open decision blocking Increment 3."*

So W-1 now carries a constraint as well as a question. Until it is settled:
**Increments 1 and 2 add no animation and change no live student timing
behaviour** — `assignments.html`'s existing `.timer.crit` pulse is left exactly
as it is, neither adopted into the shell's contract nor removed from the page.
Leaving a live behaviour untouched is the only move available that does not
pre-answer the question, and it is deliberately not the same as endorsing it.
**W-1 blocks Increment 3.**

#### 17.12.1 · W-5 — CLOSED: one unified footer (2026-09-05)

**[user constraint], decided on review:**

> *"The shell owns one footer. Capabilities/sources may contribute information
> through defined footer slots, but must not create competing/duplicate
> footers."*

**The rule.** R5 is **one** footer, owned by the shell and built once. A source
or a capability contributes to it through **named slots** and never by rendering
a footer of its own. There is no second footer, no per-source footer, and no
capability that appends one at `document.body` level — R6 is for overlays, and
an overlay is not a footer.

**What it replaces.** **[measured]** `assignments.html` today carries two
complete footers — `#footer` and `#hwFooter`, `#palette` and `#hwPalette`, and
four navigation buttons (`#prevBtn`/`#nextBtn`, `#hwPrevBtn`/`#hwNextBtn`) where
two would do. Under W-5 that becomes one footer whose contents are
source-parameterised: the homework source supplies its own submit label and its
own palette states, and supplies them **into** the shell's footer.

**Why the slot model rather than a source-owned footer.** The alternative
considered — let each source render whatever footer it likes — is rejected for
the reason W-5 was open in the first place: two footers built independently
drift, and the drift shows up as two different answers to *"what does Previous
do on the last question?"* A slot has a contract; a duplicate has a habit.

**What this decision does NOT authorize.** It is a rule for the shell, not a
change to a live page. `assignments.html`'s two footers stay exactly as they are
until the increment that builds R5 — which is **Increment 3**, still blocked on
W-1. W-5 being closed removes one of Increment 3's two blockers and starts
nothing.

### 17.13 · Validation obligations

**[design decision]** No increment against this section merges without these.
They are stated now so that a later suite cannot be written to fit whatever got
built.

**Structural — assertable without a browser:**

1. The shell exposes exactly the seven regions of §17.3, named.
2. The `toolslot` is present and empty when no tool capability is available.
3. **No control, focusable element or student-visible string names a calculator
   or Desmos while `available()` is false.** This is the §17.10.3 assertion and
   it must be able to go red: a mutant that renders a `disabled` button must
   **fail** the suite.
4. The shell contains **no** `desmos-check` reference and no `sessionStorage`
   override of `available()` (§17.10.2). A mutant restoring `checkMode()` must
   fail.
5. `available()` reads the registry policy and nothing else — asserted against
   the source with `--` comments stripped, per the rule that a check reading
   prose is a check that can only ever raise.
6. Every source adapter implements all of §17.6's interface; a missing method
   fails.
7. The shell calls no analyzer writer by name, for any source (§17.9).
8. The shell renders figures through `StimulusView.render()` and through no
   second path.
9. `.as-*` is the only prefix the shell's own CSS introduces; no rule under
   `.sv-*`, `.rv-*`, `.ex-*` or `.xc-*` (§17.8).
10. The four Desmos gates are each asserted **closed**, separately — so that
    opening one by accident fails four checks and not zero.

**Behavioural — headless, in a browser:**

11. A platform sitting calls `ExamMistakesLogger.process`, `regenerateWeaknessReports`
    and `updateStreak`; a teacher sitting and a homework sitting call each of
    them **zero** times. This is the existing proof and it must survive the
    shell.
12. `?desmos-check=1` on a student surface renders **no** calculator control —
    and neither does any other query string, hash fragment or stored flag. The
    browser check drives the same substitutions obligation 14 asserts
    statically, because a static scan proves the code does not *read* a flag
    and only a run proves the control does not *appear*.
13. Resume keys stay namespaced across all three sources; a refresh on one never
    resumes another.

**Added on review, 2026-09-05.** Three obligations the three decisions bring
with them. They are numbered after the original thirteen rather than folded into
them, so that a reference elsewhere in this section still points where it did.

14. **No student-reachable override path of any kind reaches `available()`**
    (§17.10.2, LOCKED). Obligation 4 names the one path that exists today; this
    is the general rule, and it is deliberately written against the *shape*
    rather than the spelling: `available()` is asserted to derive from the exam
    policy alone, with no read of `location.search`, `location.hash`,
    `sessionStorage`, `localStorage`, `document.cookie`, or any settable global.
    Each is its own mutant, and **a substitution that merely renames
    `desmos-check` must fail this check even though it passes 4.** Structural.
15. **Exactly one footer** (W-5, §17.12.1). The shell builds one R5, and no
    source or capability renders a second. A mutant in which a source appends
    its own footer — or appends one at `document.body` level — must fail.
    Structural.
16. **No animation is introduced and no live student timing behaviour changes**
    while W-1 is open (§17.12). Increments 1 and 2 add no `animation`,
    `transition` or `@keyframes` rule to any timing surface, and leave
    `assignments.html`'s existing `.timer.crit` **byte-identical**. Structural,
    and the byte-identity half is the part that can actually go red.

**Mutation-tested, not merely green.** Every assertion above must be shown to go
red under a mutant that breaks it. The three the reviewer should demand first
are **3**, **12** and **14**, because a "no button appears" assertion passes
trivially against a page that renders nothing at all — a fixture in which the
button *would* appear if the gate were open is what makes it evidence — and
because 14 is the only one of the three that a renamed bypass cannot walk
past.

### 17.14 · The increment sequence

Approved so far: **Increment 1 only**, and Increment 1 is this section.

| # | Increment | Status | Adds |
|---|---|---|---|
| **1** | Shell definition | **APPROVED with three decisions, 2026-09-05** (§17.10.2 LOCKED · W-1 open · W-5 closed) | nothing executable |
| **2** | Ambience | **BUILT, INERT — 2026-09-05, §17.15** | `exam-ambience.js` + 7 mp3 assets + the `.gitattributes` audio rules. **No CSP change** — see the correction below |
| **2b** | Audio / announcements | **DEFERRED to its own increment** | `exam-audio.js` needs `exam-registry.js` for its schedule and can serve only the platform source until W-3 is settled (§17.15.3) |
| **3** | Chrome adaptation | not started | `exam-chrome.js` Timer + Navigator into R2/R5 — **blocked on W-1** (W-5 closed, §17.12.1) |
| **4** | Calculator / Desmos | not started | licence-gated; nothing student-visible until §17.10.4 is done |
| — | Integrity | not scheduled | **blocked on W-2** |

**CSP — a correction to this table, 2026-09-05.** The Increment 2 row read
*"no CSP change (`media-src 'self' data: blob:` already covers them)"*. The
conclusion was right and **the directive was wrong**. `media-src` governs
`<audio>` and `<video>` elements; `exam-ambience.js` loads its clips with
`root.fetch('assets/exam-ambience/<name>.mp3')` and `decodeAudioData`, and a
`fetch` is governed by **`connect-src`**. The live policy is
`connect-src 'self' https://…supabase.co wss://…supabase.co`, and `'self'`
covers a same-origin relative fetch — so **no CSP change is required**, for that
reason and not the one first recorded. Naming the wrong directive is how a later
CSP edit breaks this silently: someone tightening `connect-src` would have no
reason to think audio depended on it.

**[user constraint]** *"Do not begin Increment 2 (audio) until this shell
definition is reviewed and explicitly approved."* Approval of this section is
approval of the **definition**, and is not approval of Increment 2.

**Increments 1 and 2 carry W-1's constraint** (§17.12): no animation, and no
change to live student timing behaviour. Increment 2 satisfies it by
construction — it lives entirely in R7 and touches no DOM — but the constraint
is recorded against both increments rather than against the one that could
plausibly break it, because a rule that only binds where it is inconvenient is
not a rule.

**A note on order.** Increment 3 is where the shell becomes real, and it is
still blocked — on W-1 alone now that W-5 is closed. Increment 2 is unblocked
and adds a capability in R7 that touches no DOM at all. That is why audio comes
first: it is the increment that can be built without pre-answering W-1.

### 17.15 · Increment 2 — Ambience: BUILT AND INERT (2026-09-05)

**The capability ships; nothing calls it.** `exam-ambience.js` is in the tree
with its seven recordings and a 58-check suite, and **no page loads it, no page
enables it, and no student can hear it.** That is the increment as approved, not
an omission: turning it on needs a control, the control is a shell decision, and
inventing one to make the capability look finished is exactly the move this
process exists to stop.

#### 17.15.1 · What shipped

| File | Change | Evidence |
|---|---|---|
| `.gitattributes` | **+6 lines** — `*.mp3` / `*.wav` / `*.ogg` / `*.m4a` marked `binary` | now byte-identical to the old branch's copy; was 49 lines / 1,961 B with **no audio rule** |
| `assets/exam-ambience/voice-1…7.mp3` | **7 new binaries**, 1,341,954 B | every one byte-identical to source — blob sha, md5 and size all matched, and all seven begin `49 44 33` (`ID3`) |
| `exam-ambience.js` | **new**, 441 lines / 21,311 B | verbatim from source **except** the F-5 fix; the full diff against source is 9 added lines and nothing else |
| `tests/exam-ambience.test.mjs` | **new**, 58 checks | the source suite ported unchanged, plus the F-5 section |

**`.gitattributes` had to land first, and that ordering is the point.** `main`
carries `* text=auto eol=lf` and binary rules for eleven image, font and
document types — and none for audio. Committing an mp3 under that policy invites
`text=auto` to sniff it as text and rewrite bytes on checkout; the old branch's
own note says so in as many words: *"The first audio in this repository; without
these lines `text=auto` would sniff them as text and rewrite bytes on
checkout."*

**The per-clip measurements came across untouched.** `TRIM`, `PEAK_DBFS` and
`DURATION_S` describe the same bytes as the shipped files, and the suite asserts
the no-clipping invariant arithmetically — `PEAK + TRIM + gain` under 0 dBFS for
every clip, at the shipped gain and at `safeMax` — so it can be checked in CI
without decoding an mp3.

#### 17.15.2 · F-5 — the one behavioural change, and why it is a fix

**The defect, measured before the fix.** In the module as written,
`disable()` called `ctx.suspend()` and **nothing anywhere called `resume()`** —
the whole file referenced `ctx.state` exactly once, in `disable()`. So:

- `disable()` then `enable()` left the context suspended. The layer reported
  success, armed the full schedule, and played **silence**.
- A context constructed outside a user gesture is **born suspended**, so this
  was silence on the *first* enable too, not only the second.

**The fix is one guarded line** in `enable()`, immediately after `context()`
succeeds and before `on = true`:

```js
try { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); } catch (e) {}
```

Deliberately not awaited, for the reason nothing else in this file is awaited:
events are armed against the module clock rather than against the resume, and a
rejected promise must not take the layer down. Nothing else moved — no schedule
rule, no gain, no trim, no planner, no measurement table.

**Why the existing suite could never have caught it.** Its harness supplies
**no `AudioContext`**, so `context()` returns null and `enable()` returns false;
every one of its original assertions passes without the layer ever having run.
The F-5 section therefore builds its own sandbox with a fake context that
records `suspend`/`resume` calls — a call log, because a state assignment that
merely looks like a fix would satisfy a state check alone.

**Mutation-tested, three mutants, all killed:**

| Mutant | Result |
|---|---|
| the fix removed entirely (the pre-fix module) | **5 checks FAILED** |
| `resume()` called unconditionally (state guard dropped) | **4 checks FAILED** |
| the `&& ctx.resume` existence guard dropped | **1 check FAILED** |

The second mutant matters as much as the first: it proves the assertions test
the *guard* and not merely the presence of a `resume()` call, so "resume
everything, always" is not a passing answer.

#### 17.15.3 · What this increment deliberately did NOT do

Each of these was decided, not overlooked.

- **No caller.** `assignments.html` is untouched — zero lines changed. The
  capability is inert by construction.
- **No student control (F-4).** Ambience has **no preference storage at all** —
  zero `localStorage` references in the module — and its only controls lived in
  `exam-reviewer-bar.js`, which §17.4 excludes. A control is a shell decision
  and belongs to its own increment.
- **No audio / announcements (Increment 2b).** `exam-audio.js` is not here and
  neither is `exam-registry.js`. Two measured reasons: the announcement schedule
  must come from the registry (*"No timing rule is duplicated here, and none may
  be added"*), and of the three sources only **platform** carries an `exam_code`
  the registry recognises — `student_my_teacher_exams` returns none and
  `student_my_homework` has no duration column at all. That is **W-3** biting
  exactly where §17.6.1 predicted, and it is not settled here.
- **No CSP change.** Measured unnecessary — see the correction in §17.14.
- **No schema, RPC, migration, Stage 1, renderer, calculator, Desmos, integrity,
  reviewer-bar or workspace work**, and no timer or animation change: **W-1
  stays open** and `.timer.crit` is untouched. **W-5 stays closed** — a module
  that creates no element cannot create a second footer.

#### 17.15.4 · A note for whoever wires this up

`exam-ambience.js` is a **module-clock** capability: `noteModule(key)` resets
its schedule and `enable()` starts it. Its fixed points sit at 10:00, 20:00,
32:00, 33:00 and 34:00 of a module, and `schedule()` defaults to **35 minutes** —
the SAT module shape. A platform section or a teacher exam has a duration to
hang that on. **Homework does not**: it is untimed and has no module, so what a
module clock would even mean there is an open question, not a wiring detail.

### 17.16 · F-4 — CLOSED: the room-sound control (2026-09-05)

Increment 2 shipped a capability nothing could start. **F-4 is the control that
starts it**, and it is deliberately the smallest one that works: an icon button
in R1, on the exam screen, off until a student asks.

**What this closure authorizes, exactly.** The **minimum R1 integration on
`assignments.html`** and nothing else. It is **not** authorization for R2, for
Increment 3, for a settings surface, or for any further shell work.
**[user constraint]:** *"Do not interpret this as authorization for Increment
3/R2 work."*

#### 17.16.1 · The three locked decisions

**DEFAULT OFF.** One boolean at `localStorage['simath_exam_ambience']`, and
**only the exact string `'on'` counts as on** — `'ON'`, `'true'`, `'1'` and
`'yes'` all read as off, each asserted. Every failure path returns false:
storage that throws, and storage that does not exist as an identifier at all,
are two different failures and both are tested. A student who has never chosen
hears nothing, and a blocked `localStorage` is not a reason to start playing
sound at somebody.

**SITTING ONLY.** The control is shown on `sitting` and on no other screen —
`pick`, `hwSit`, `hwRev`, `done` and `loading` all hide it *and* silence the
layer. The reason is the one `show()` already gives for the clock: ambience is a
**module** clock with fixed points at 10:00, 20:00 and 32:00 of a module, and
homework is untimed and has no module. **No ambience control on homework.**

**`assignments.html` IS in scope**, for F-4 and for the reason the audit gave:
R1 on that page is the only student shell that exists. R2 is a §17.3
specification that nothing builds yet.

#### 17.16.2 · The control

An **icon button**, 34×34, between the spacer and `#timer`. Not a labelled pill:
the bar is 58px, already carries three things on a phone, and **this page has no
width breakpoint at all** — its only `@media` is `prefers-reduced-motion`.

It carries a **real accessible name**, `aria-label="Room sound"`, and its state
lives in **`aria-pressed`** — which is also what the CSS keys on, so the styling
and the accessibility tree cannot disagree; there is no second class to forget.
The SVG is `aria-hidden`. **The house `.toggle` was deliberately not reused:**
`settings.html` ships four of them and **none has an accessible name**, so a
screen reader announces an unnamed checkbox.

**Lifecycle.** Entering `sitting`: paint from the stored preference, call
`noteModule(attempt_id)`, and `enable()` **only if the preference is already
on**. Leaving `sitting`: always `disable()`, so the layer can never outlive the
sitting it belongs to — the failure the old engine's calculator panel needed a
`MutationObserver` to fix. A click flips, persists, paints and applies.
`noteModule()` is idempotent on an unchanged key, so the `show('sitting')` that
recovers from a failed submit does not restart the schedule.

With no `SiExamAmbience` loaded the control **is not rendered at all**, rather
than rendered dead.

#### 17.16.3 · Isolation, asserted rather than asserted-to

| Boundary | How it is held |
|---|---|
| **W-1, still OPEN** | The three `.timer` rules are asserted **byte-identical**, the page still contains exactly **one** `animation:pulse`, and the control animates nothing. The preference block is asserted to contain no `S.tick`, `S.endsAt`, `startTimer` or `timer`. |
| **W-5, still CLOSED** | The page still has exactly **two** footer ids. The block contains no `createElement` and no `Footer`. |
| **Desmos / calculator** | The block contains no `desmos`, `checkMode` or `Calculator`. No bypass was added, and none could be: this control never consults `available()`. |
| **Audio / registry** | No `SiExamAudio`, no `SiExamRegistry`. W-3 is untouched. |
| **Delivery** | The block calls no RPC and reads no `S.source`. It reads one storage key and `S.attempt.attempt_id`. |
| **Schema** | None. `profiles` carries **column-level UPDATE grants** — 24 of 39 columns — so a profile-backed preference would need a column *and* a grant, i.e. a migration. `localStorage` avoids that entirely. |

#### 17.16.4 · How it is proved

The suite proves **wiring** by reading the page source and **rules** by *running*
them: the preference block is sliced out and executed against fake storage,
because *"returns false when `localStorage` throws"* is not a claim a regex can
make. `tests/teacher-class-patterns.test.mjs` set that precedent.

`tests/exam-page.test.mjs` goes **47 → 119 checks**. **Ten mutants, ten killed:**

| Mutant | Checks failed |
|---|---|
| default ON when the key is absent | 14 |
| storage failure falls back to ON | 3 |
| gate widened to homework | 2 |
| leaving the screen no longer silences | 5 |
| autoplay — enable regardless of choice | 1 |
| accessible name removed | 1 |
| `noteModule` no longer called | 3 |
| the preference is never written | 7 |
| an animation added to the control | 2 |
| the button moved after the clock | 1 |

**One of them had to be rewritten, and that is worth recording.** The first
attempt at the last mutant appended a comment after the clock instead of moving
the button, so both `indexOf` values were unchanged and it survived — a mutant
that tested nothing, not a check that missed something. Re-run as a genuine
swap of the two elements, it was caught. *A surviving mutant is a claim about
the test only once the mutant is known to bite.*
