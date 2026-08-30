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
  `teacher_can_see_student()` and is **PREPARED, not applied**; the card degrades
  to its previous state until it is.
- **On the ordering.** T1 was written above as waiting on T0's exit condition.
  It was built first, deliberately: T1 carries no analytics, so nothing in it
  depends on how much evidence exists, while the access model is the one part
  that is expensive to get wrong and impossible to retrofit. The sequencing
  constraint protects *insights* from thin data — it was never a reason to
  defer consent. T2 onward still waits on the evidence.

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

---

## 16. Provenance

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
