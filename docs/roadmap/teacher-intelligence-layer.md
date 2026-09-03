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

    ### 15.15c · The H2 package as approved — three files, one unit

    Approved 2026-09-03: **`20260902b` + `20260902c` + `20260902d` apply
    together or not at all**, and `20260902y` undoes all three. The rollback is
    safe on a partially applied package — every drop is `if exists`, every count
    `to_regclass`-guarded — which is what makes three statements behave as one
    unit. All four files remain PREPARED and unapplied.

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
