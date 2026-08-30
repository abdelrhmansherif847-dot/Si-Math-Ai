-- =====================================================================
-- T1.6 — The intervention record
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-08-30 to igvkyxkmjnkzscqgommj with explicit owner
--         approval (CLAUDE.md §3), recorded as schema_migrations version
--         20260830204951 `teacher_intervention_record`. Revision 1. The applied
--         body differed only in header text and the omitted outer transaction.
--         Verified in two passes — 12 structural, 25 behavioural, 37 of 37 —
--         including that `service_role`, which holds INSERT/UPDATE/DELETE on
--         this table and bypasses RLS, is still refused by the append-only
--         trigger (42501). The behavioural pass ran against real accounts
--         inside a transaction that was rolled back; this table and all four
--         workspace tables were confirmed empty afterwards. Full record:
--         docs/engineering/teacher-intervention-verification.md §7.
-- DEPENDS ON: 20260830a/b/c (teacher foundation) and 20260830d (weakness read),
--         all applied 2026-08-30.
-- FILE NAME: written as `20260830e_…` and renamed to `g` after the Mock
--         delivery work took `e` and `f` on this same branch two hours earlier
--         the same day. The letters now match the applied order — e at 20:26,
--         f at 20:30, this at 20:49 — so the rename restored the ordering
--         rather than inventing one. Its rollback moved from `y` to `x` for the
--         same reason. Two different files sharing one ordinal is not a
--         cosmetic problem in a repo where the prefix IS the order.
-- DIRECTION: docs/roadmap/teacher-intelligence-layer.md §10 (stage T1.6), §12
--         (the intervention loop), §8.3 (the read-only boundary), §8.2
--         principle 5 (nothing about a student the student cannot see).
--
-- WHAT THIS IS
-- -----------
-- One durable record of a decision a teacher ALREADY MADE: "I covered this with
-- this student, on this date." It is not a recommendation, not a flag, not a
-- score, and not an analysis. The platform does not choose the intervention; it
-- stores the one the teacher chose and shows it back.
--
-- WHY IT SHIPS BEFORE THE ANALYTICS IT BELONGS TO
-- -----------------------------------------------
-- §12's loop compares what happened after an intervention with what happened
-- before it, and §4.7 fixes the condition that makes such a comparison honest:
-- "A leading indicator is only leading if it was recorded before the outcome it
-- precedes." A log started on the day the loop is built has no history to
-- compare against, and anything backfilled into it is chosen with the outcome
-- already known. Starting the record early is the only version of it that can
-- ever be evidence. Same argument as T1, on a different table.
--
-- WHAT IT IS NOT, AND WHAT ENFORCES THAT
-- --------------------------------------
--   * NOT an input to the learning profile (§8.3). There is NO foreign key from
--     this table into weakness_reports, weakness_signals, mastery_records,
--     question_records, focus_tasks, exam_* or any other academic table, and
--     nothing here is readable by regenerate-reports.js. The precedent is
--     support_tickets, whose comment records the same boundary for the same
--     reason: a diagnosis mixed with staff opinion can never be unmixed.
--     tests/teacher-intervention.test.mjs fails if such a reference appears.
--     The taxonomy references below are deliberate and are NOT that: the
--     taxonomy is curriculum vocabulary, identical for every student on the
--     platform, and carries no evidence about anybody.
--   * NOT a teacher performance record (§12, §9). No aggregate across teachers,
--     no comparison, no upward channel. There is no function here that reads
--     across workspaces, and there is no path by which one could be added
--     without an approved migration.
--   * NOT the loop. An intervention record with nothing measuring the outcome is
--     a log. It becomes the loop only when a later stage can say whether the
--     difficulty changed — which still waits on the evidence §5 says does not
--     exist. Nothing built on this table may be described as closing the loop.
--
-- APPEND-ONLY, AND WITHDRAWABLE RATHER THAN EDITABLE
-- --------------------------------------------------
-- A record whose text can be revised after the fact loses the one property that
-- makes it useful later. So: no UPDATE except a single one-way withdrawal, and
-- no DELETE path for anyone. A mistake is withdrawn, and the withdrawal is
-- itself dated. The trigger below is what enforces it, not convention.
--
-- TWO DATES, ON PURPOSE
-- ---------------------
-- decided_on is what the teacher says happened and may be backdated within a
-- short window, because "I covered this last Tuesday" is the normal case.
-- created_at is when the row was written and can never be moved. A later loop
-- must use created_at for the recorded-before-the-outcome test and decided_on
-- for the teaching narrative; collapsing them into one column would quietly
-- destroy the distinction §4.7 depends on.
--
-- THE STUDENT CAN READ IT
-- -----------------------
-- §8.2 principle 5 states, as a design constraint rather than a toggle, that
-- nothing may be held about a student that the student cannot themselves see.
-- This is the first surface where that costs something, and it is honoured: the
-- read policy admits the student named on the row, and the writing surface tells
-- the teacher so before they type. A note a teacher would not want their student
-- to read is a note that belongs somewhere other than this platform.
-- =====================================================================

begin;

-- ── 1 · what kind of intervention ────────────────────────────────────────
-- A closed set, deliberately small. These are the things a teacher actually
-- does between sessions; 'other' exists so the list never forces a lie, and its
-- frequency is the signal that the list needs a new member.

create type intervention_kind as enum (
  'retaught',          -- covered it again, in class or one to one
  'spoke_with',        -- a conversation, not a re-teach
  'assigned_practice', -- gave them work on it, off-platform or on
  'other'
);

-- ── 2 · the record ───────────────────────────────────────────────────────

create table class_interventions (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references teacher_workspaces(id) on delete cascade,

  -- NULL means the whole class. No surface writes a class-wide row today —
  -- there is no class-level view (§15 open question 11, answered "not yet") —
  -- and the column is nullable now so that adding one later is a policy change
  -- rather than a migration against live rows.
  student_id     uuid references auth.users(id) on delete cascade,

  -- Curriculum vocabulary, not evidence. NULL is expected and honest: 86 of 225
  -- live weakness reports carry no canonical subtopic_id, so a teacher acting on
  -- one of those records it by label alone rather than being blocked.
  topic_id       text references taxonomy_topics(id),
  subtopic_id    text references taxonomy_subtopics(id),

  -- What the teacher was looking at, as it read on screen at that moment. Kept
  -- verbatim so the record still means something if a label is later renamed.
  subject_label  text not null check (length(btrim(subject_label)) between 1 and 120),

  kind           intervention_kind not null,
  note           text check (note is null or length(btrim(note)) between 1 and 500),

  decided_on     date not null,
  created_at     timestamptz not null default now(),
  decided_by     uuid not null references auth.users(id),

  withdrawn_at   timestamptz,
  withdrawn_by   uuid references auth.users(id),

  -- A subtopic implies its topic. Recording one without the other produces a row
  -- that cannot be grouped and cannot be explained.
  constraint class_interventions_taxonomy_pair
    check (subtopic_id is null or topic_id is not null),

  -- Withdrawal is one fact with two columns; half of it is a bug.
  constraint class_interventions_withdrawal_whole
    check ((withdrawn_at is null) = (withdrawn_by is null))
);

comment on table class_interventions is
  'A teacher''s record of something they already did about a difficulty — '
  'never a recommendation, never an analysis, and never an input to the '
  'learning profile. Carries NO foreign key into any academic table, for the '
  'same reason support_tickets does not (§8.3). Append-only: withdrawable, '
  'never editable, never deletable. The student named on a row can read it '
  '(§8.2 principle 5). See docs/roadmap/teacher-intelligence-layer.md §10 T1.6.';

comment on column class_interventions.decided_on is
  'What the teacher says happened, backdatable up to 30 days. Use created_at, '
  'never this, for any recorded-before-the-outcome test (§4.7).';
comment on column class_interventions.student_id is
  'NULL means the whole class. No surface writes that today.';

create index class_interventions_ws_idx
  on class_interventions (workspace_id, decided_on desc);
create index class_interventions_student_idx
  on class_interventions (student_id, decided_on desc) where student_id is not null;
create index class_interventions_subtopic_idx
  on class_interventions (workspace_id, subtopic_id) where subtopic_id is not null;

-- ── 3 · append-only, enforced ────────────────────────────────────────────
-- The comment above is a promise; this trigger is the thing that keeps it. It
-- runs for every writer including service_role, so a future job cannot quietly
-- rewrite history either.

create or replace function class_interventions_append_only()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'class_interventions is append-only: withdraw the record, do not delete it'
      using errcode = '42501';
  end if;

  -- The ONLY permitted update is a first withdrawal. Everything else — the
  -- subject, the kind, the note, the dates, who wrote it — is frozen at insert.
  if old.withdrawn_at is not null then
    raise exception 'class_interventions: this record is already withdrawn'
      using errcode = '22023';
  end if;
  if new.withdrawn_at is null then
    raise exception 'class_interventions: the only permitted update is a withdrawal'
      using errcode = '42501';
  end if;
  if row(new.id, new.workspace_id, new.student_id, new.topic_id, new.subtopic_id,
         new.subject_label, new.kind, new.note, new.decided_on, new.created_at,
         new.decided_by)
     is distinct from
     row(old.id, old.workspace_id, old.student_id, old.topic_id, old.subtopic_id,
         old.subject_label, old.kind, old.note, old.decided_on, old.created_at,
         old.decided_by) then
    raise exception 'class_interventions: a withdrawal may change nothing else'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger class_interventions_append_only_trg
  before update or delete on class_interventions
  for each row execute function class_interventions_append_only();

comment on function class_interventions_append_only() is
  'Append-only enforcement for class_interventions. No DELETE for anyone; the '
  'single permitted UPDATE is a first withdrawal that changes nothing else.';

-- ── 4 · RLS ──────────────────────────────────────────────────────────────
-- Same discipline as 20260830b: RLS on, table privileges stripped and granted
-- back deliberately, writes only through the security-definer RPCs below. A
-- policy is a filter on rows a role may already touch, so the revoke is what
-- makes the grant meaningful.

alter table class_interventions enable row level security;

revoke all on table class_interventions from anon, authenticated;
grant select on table class_interventions to authenticated;

-- Staff of the workspace read every record in it. The assistant reads exactly
-- what the teacher reads and writes nothing — the same shape as the weakness
-- read, and the same sentence on the surface.
create policy class_interventions_staff_read on class_interventions
  for select to authenticated
  using (workspace_is_active_staff(workspace_id));

-- §8.2 principle 5. The student sees what is held about them, including a
-- withdrawn record — a withdrawal is not a deletion and must not read as one.
create policy class_interventions_subject_read on class_interventions
  for select to authenticated
  using (student_id = (select auth.uid()));

-- ── 5 · write path ───────────────────────────────────────────────────────
-- Owner only. An assistant's page says "you can change nothing", and that
-- sentence is enforced here rather than in the markup that makes it.

create or replace function teacher_record_intervention(
  p_workspace     uuid,
  p_student       uuid,
  p_kind          intervention_kind,
  p_subject_label text,
  p_topic_id      text default null,
  p_subtopic_id   text default null,
  p_note          text default null,
  p_decided_on    date default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_on date := coalesce(p_decided_on, current_date);
  v_id uuid;
begin
  if not workspace_is_owner(p_workspace) then
    raise exception 'teacher_record_intervention: only the teacher who owns this class may record here'
      using errcode = '42501';
  end if;

  -- The same three gates the weakness read passes, for the same reason: being
  -- staff of a workspace is not by itself a relationship to a student.
  if p_student is not null then
    if not teacher_can_see_student(p_student) then
      raise exception 'teacher_record_intervention: no active link to this student'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from workspace_students ws
       where ws.workspace_id = p_workspace
         and ws.student_id = p_student
         and ws.status = 'active'
         and (ws.expires_at is null or ws.expires_at > now())
    ) then
      raise exception 'teacher_record_intervention: that student is not in this workspace'
        using errcode = '42501';
    end if;
  end if;

  -- A record of the future is not a record. A backdate longer than the window
  -- is a recollection, and §4.7 is the reason not to store one as evidence.
  if v_on > current_date then
    raise exception 'teacher_record_intervention: decided_on cannot be in the future'
      using errcode = '22023';
  end if;
  if v_on < current_date - 30 then
    raise exception 'teacher_record_intervention: decided_on cannot be more than 30 days ago'
      using errcode = '22023';
  end if;

  insert into class_interventions
    (workspace_id, student_id, topic_id, subtopic_id, subject_label, kind, note,
     decided_on, decided_by)
  values
    (p_workspace, p_student, p_topic_id, p_subtopic_id, btrim(p_subject_label),
     p_kind, nullif(btrim(coalesce(p_note, '')), ''), v_on, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function teacher_record_intervention(uuid, uuid, intervention_kind, text, text, text, text, date) is
  'Records something the teacher already did. Owner only, gated by the same '
  'workspace + link + pairing checks as the weakness read. Writes nothing '
  'anywhere else, and is read by no analyzer.';

create or replace function teacher_withdraw_intervention(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from class_interventions where id = p_id;
  if v_ws is null then
    raise exception 'teacher_withdraw_intervention: no such record' using errcode = '22023';
  end if;
  if not workspace_is_owner(v_ws) then
    raise exception 'teacher_withdraw_intervention: only the teacher who owns this class may withdraw'
      using errcode = '42501';
  end if;

  update class_interventions
     set withdrawn_at = now(), withdrawn_by = (select auth.uid())
   where id = p_id;
end;
$$;

comment on function teacher_withdraw_intervention(uuid) is
  'Withdraws one record. The row survives, dated — a withdrawal is not a '
  'deletion, and the student can still see that it happened.';

-- ── 6 · read paths ───────────────────────────────────────────────────────
-- Both are thin wrappers over the policies above, and exist so a surface never
-- has to know the shape of the table.

create or replace function teacher_student_interventions(p_workspace uuid, p_student uuid)
returns table (
  id            uuid,
  kind          intervention_kind,
  subject_label text,
  topic_id      text,
  subtopic_id   text,
  note          text,
  decided_on    date,
  created_at    timestamptz,
  withdrawn_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not workspace_is_active_staff(p_workspace) then
    raise exception 'teacher_student_interventions: not staff of this workspace' using errcode = '42501';
  end if;
  if not teacher_can_see_student(p_student) then
    raise exception 'teacher_student_interventions: no active link to this student' using errcode = '42501';
  end if;
  if not exists (
    select 1 from workspace_students ws
     where ws.workspace_id = p_workspace
       and ws.student_id = p_student
       and ws.status = 'active'
       and (ws.expires_at is null or ws.expires_at > now())
  ) then
    raise exception 'teacher_student_interventions: that student is not in this workspace'
      using errcode = '42501';
  end if;

  return query
    select c.id, c.kind, c.subject_label, c.topic_id, c.subtopic_id, c.note,
           c.decided_on, c.created_at, c.withdrawn_at
      from class_interventions c
     where c.workspace_id = p_workspace
       and c.student_id = p_student
     order by c.decided_on desc, c.created_at desc;
end;
$$;

comment on function teacher_student_interventions(uuid, uuid) is
  'What this class has already recorded about this student. Withdrawn records '
  'are returned marked, never hidden.';

-- §8.2 principle 5, as a callable thing rather than a promise. The student sees
-- their own record across every class they are in, including withdrawn rows.
create or replace function student_my_interventions()
returns table (
  workspace_name text,
  kind           intervention_kind,
  subject_label  text,
  note           text,
  decided_on     date,
  withdrawn_at   timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select w.name, c.kind, c.subject_label, c.note, c.decided_on, c.withdrawn_at
    from class_interventions c
    join teacher_workspaces w on w.id = c.workspace_id
   where c.student_id = (select auth.uid())
   order by c.decided_on desc, c.created_at desc;
$$;

comment on function student_my_interventions() is
  'The student''s own view of what their teachers recorded about them. §8.2 '
  'principle 5 is a design constraint, so this function is not optional.';

-- ── 7 · privileges ───────────────────────────────────────────────────────
-- Strip the default ACL, then grant deliberately. Authorization lives in the
-- bodies above, not in who is allowed to call.

revoke all on function class_interventions_append_only() from public, anon, authenticated;
revoke all on function teacher_record_intervention(uuid, uuid, intervention_kind, text, text, text, text, date) from public, anon, authenticated;
revoke all on function teacher_withdraw_intervention(uuid) from public, anon, authenticated;
revoke all on function teacher_student_interventions(uuid, uuid) from public, anon, authenticated;
revoke all on function student_my_interventions() from public, anon, authenticated;

grant execute on function teacher_record_intervention(uuid, uuid, intervention_kind, text, text, text, text, date) to authenticated;
grant execute on function teacher_withdraw_intervention(uuid) to authenticated;
grant execute on function teacher_student_interventions(uuid, uuid) to authenticated;
grant execute on function student_my_interventions() to authenticated;

commit;
