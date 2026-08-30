-- =====================================================================
-- Teacher & Assistant Foundation · 1 of 4 — enums, tables, guards
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval.
--         Revision 1. Nothing in this file has been run against
--         igvkyxkmjnkzscqgommj. CLAUDE.md §3: writing a migration file is
--         not applying it.
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §8 (access, consent
--          and the data boundary) and §10 T1 (identity and consent, with no
--          analytics at all).
--
-- WHAT THIS IS
-- ------------
-- The smallest real architecture in which a teacher can be connected to
-- SPECIFIC students, an assistant can work under that teacher, and a student
-- can end the connection. It carries no analytics, no weakness data and no
-- academic reads of any kind — those arrive later, through this relationship,
-- once the Mock Experience produces evidence worth reading (§10).
--
-- THE CENTRAL DECISION: A TEACHER IS A RELATIONSHIP, NOT A PRIVILEGE LEVEL
-- -----------------------------------------------------------------------
-- The obvious implementation — add 'teacher' to the user_role enum — is
-- refused here, deliberately. user_role is a LADDER
-- (user < admin < super_admin < owner) read by has_role_at_least(), and every
-- rung means "can see more of the platform". A teacher is not a higher rung:
-- a teacher may see a little about a few specific people and nothing about
-- everyone else. Modelling that as a role produces one of two failures — a
-- teacher who can read every student, or a pile of exceptions bolted onto a
-- ladder that cannot express "only these students".
--
-- So being a teacher is OWNING A WORKSPACE, and seeing a student is HAVING AN
-- ACTIVE LINK TO THAT STUDENT. Both are rows. Both are revocable. Neither
-- grants anything platform-wide.
--
--   teacher_workspaces   one teacher's space. Owning it is what makes someone
--                        a teacher, and nothing else does.
--   workspace_staff      who works in it: exactly one owner, plus assistants.
--   workspace_students   THE RELATIONSHIP. One row per (workspace, student).
--                        A student may hold rows in many workspaces — the
--                        normal Egyptian case is school + centre + private
--                        tutor, and none of them outranks the others.
--   workspace_audit_log  append-only record of every lifecycle event.
--
-- ONLY A STUDENT CAN CREATE A LINK
-- --------------------------------
-- There is no teacher-side invitation by email in this phase, and that is a
-- design choice rather than a missing feature. A teacher shares a join code
-- (in class, where they already have the students' attention); the student
-- enters it. Three things follow:
--
--   * Consent is an ACT, not a default. The link exists because the student
--     made it exist.
--   * No email lookup exists, so the surface cannot be used to probe whether
--     an address has an account.
--   * A teacher can never manufacture a connection to a student who did
--     nothing.
--
-- The guard triggers below enforce this even against a SECURITY DEFINER
-- function: definer rights bypass RLS, but they do NOT bypass a trigger, and
-- auth.uid() inside the trigger is still the real caller. So "only the student
-- may bring their own link into existence" is structural, not conventional.
--
-- WHAT IS DELIBERATELY ABSENT
-- ---------------------------
--   * No policy, column, view or foreign key touching question_records,
--     mastery_records, weakness_*, focus_*, session_questions, chat_sessions,
--     exam_* or profiles. A teacher's read path is a purpose-built RPC in
--     migration 3 with a named column list, never a widened policy on a
--     student's academic tables. tests/teacher-access-scope.test.mjs fails if
--     that ever stops being true.
--   * No self-serve workspace creation. Creating a workspace is admin-only in
--     this phase (migration 3), because teacher identity verification is open
--     question 7 in the direction record and inventing an answer here would
--     let any account collect student grants.
--   * No write path from the teacher side into anything the student's learning
--     profile reads. The support system's boundary, copied deliberately.
-- =====================================================================

begin;

-- ── 1 · enums ────────────────────────────────────────────────────────────
-- Spelled out rather than left as text + CHECK so that a typo in a future
-- policy is a type error at deploy time instead of a silently-empty predicate.

create type workspace_staff_role as enum ('owner', 'assistant');

-- 'pending' exists for staff and NOT for students, and the asymmetry is the
-- point. A student joining shares their own data with a teacher they chose:
-- their act is the whole authorization. Someone joining as STAFF is asking to
-- see other people's data, so a leaked staff code must not be sufficient —
-- the owner has to activate them.
create type workspace_staff_status as enum ('pending', 'active', 'removed');

-- Two distinct ways for a link to end, kept distinct because who ended it is
-- exactly what an audit needs to answer a year later.
--   revoked — the student withdrew consent
--   removed — the teacher took the student off their roster
create type workspace_link_status as enum ('active', 'revoked', 'removed');

create type workspace_audit_action as enum (
  'workspace_created',
  'join_code_rotated',
  'student_joined',
  'student_left',
  'student_removed',
  'staff_joined',
  'staff_activated',
  'staff_removed'
);

-- ── 2 · join codes ───────────────────────────────────────────────────────
-- 8 characters from a 31-symbol alphabet with the ambiguous glyphs removed
-- (no O/0, no I/1) because these are read aloud in a classroom and typed on
-- phones. ~2^39 of entropy: not a secret to protect data on its own, which is
-- why a student code only ever creates a link for the person who types it,
-- and a staff code only ever creates a PENDING row the owner must activate.
-- Codes are rotatable (migration 3), which is the actual answer to a leak.

create or replace function workspace_new_code()
returns text
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..8 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out;
end;
$$;

comment on function workspace_new_code() is
  'Generates an 8-character classroom-readable join code. Not a secret by '
  'itself — see the header of 20260830a. Uniqueness is enforced by the unique '
  'constraints on teacher_workspaces, and the callers in migration 3 retry.';

-- ── 3 · teacher_workspaces ───────────────────────────────────────────────

create table teacher_workspaces (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  name               text not null check (length(btrim(name)) between 2 and 80),
  -- Shared with students. Seeing it is enough to join; joining shares only
  -- your own data, with the teacher whose classroom you are sitting in.
  student_join_code  text not null unique,
  -- Shared with assistants. Produces a PENDING row and nothing more.
  staff_join_code    text not null unique,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  created_by         uuid not null references auth.users(id)
);

comment on table teacher_workspaces is
  'One teacher''s space. Owning a row here is what makes an account a teacher — '
  'there is no teacher role in user_role, by design. Created by an admin only '
  '(teacher_create_workspace), pending open question 7 in '
  'docs/roadmap/teacher-intelligence-layer.md §15.';

create index teacher_workspaces_owner_idx on teacher_workspaces (owner_id);

-- ── 4 · workspace_staff ──────────────────────────────────────────────────

create table workspace_staff (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references teacher_workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  staff_role    workspace_staff_role not null,
  status        workspace_staff_status not null default 'pending',
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  activated_by  uuid references auth.users(id),
  removed_at    timestamptz,
  removed_by    uuid references auth.users(id),
  unique (workspace_id, user_id)
);

comment on table workspace_staff is
  'Who may act inside a workspace: exactly one owner (the teacher) plus '
  'assistants. An assistant''s reach is always the owner''s roster and never '
  'wider; an assistant cannot change the roster (see 20260830c).';

create unique index workspace_staff_one_owner_idx
  on workspace_staff (workspace_id) where staff_role = 'owner';
create index workspace_staff_user_active_idx
  on workspace_staff (user_id) where status = 'active';
create index workspace_staff_workspace_idx
  on workspace_staff (workspace_id, status);

-- ── 5 · workspace_students — the relationship ────────────────────────────

create table workspace_students (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references teacher_workspaces(id) on delete cascade,
  student_id    uuid not null references auth.users(id) on delete cascade,
  status        workspace_link_status not null default 'active',
  joined_at     timestamptz not null default now(),
  ended_at      timestamptz,
  ended_by      uuid references auth.users(id),
  -- The time dimension of scope (direction record §8.2). NULL means open-ended
  -- today; the column exists now so that adding a term-bounded grant later is
  -- a policy change and not a migration against a live roster.
  expires_at    timestamptz,
  unique (workspace_id, student_id)
);

comment on table workspace_students is
  'THE teacher-student relationship, and the only thing that grants a teacher '
  'any visibility of a student. Many rows per student across workspaces is the '
  'normal case. Created ONLY by the student (guard: workspace_students_guard), '
  'endable by either side. Access is derived from an active row and never from '
  'a role.';

create index workspace_students_student_active_idx
  on workspace_students (student_id) where status = 'active';
create index workspace_students_workspace_idx
  on workspace_students (workspace_id, status);

-- ── 6 · workspace_audit_log ──────────────────────────────────────────────
-- Append-only. §8.2 principle 4: teacher access to student data is auditable.
-- This phase records the LIFECYCLE (who connected, who ended it, when). Logging
-- individual reads is a later decision and a different cost profile; the
-- direction record says so rather than pretending this covers it.

create table workspace_audit_log (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references teacher_workspaces(id) on delete cascade,
  actor_id      uuid references auth.users(id),
  action        workspace_audit_action not null,
  subject_id    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  meta          jsonb not null default '{}'::jsonb
);

comment on table workspace_audit_log is
  'Append-only lifecycle trail for a workspace. No UPDATE or DELETE path exists '
  'for anyone: 20260830b grants SELECT only, and the RPCs in 20260830c are the '
  'sole writers.';

create index workspace_audit_workspace_idx on workspace_audit_log (workspace_id, created_at desc);

-- ── 7 · guards ───────────────────────────────────────────────────────────
-- RLS removes verbs; a guard polices values. Both are needed, and the guard is
-- the half that still holds when a SECURITY DEFINER function is doing the
-- writing — which is exactly how every write in this system happens.

create or replace function workspace_students_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from teacher_workspaces where id = new.workspace_id;

  if tg_op = 'INSERT' then
    -- Consent, made structural. Not "the RPC checks this" — nothing can create
    -- a link to a student except a session authenticated AS that student.
    if new.student_id is distinct from auth.uid() then
      raise exception 'workspace_students: a link can only be created by the student it belongs to'
        using errcode = '42501';
    end if;
    if new.status <> 'active' then
      raise exception 'workspace_students: a new link is born active or not at all'
        using errcode = '22000';
    end if;
    if new.student_id = v_owner then
      raise exception 'workspace_students: a teacher cannot enrol as their own student'
        using errcode = '22000';
    end if;
    if exists (select 1 from workspace_staff s
               where s.workspace_id = new.workspace_id
                 and s.user_id = new.student_id
                 and s.status <> 'removed') then
      raise exception 'workspace_students: this account is staff in this workspace'
        using errcode = '22000';
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if new.workspace_id is distinct from old.workspace_id
     or new.student_id is distinct from old.student_id then
    raise exception 'workspace_students: workspace_id and student_id are immutable'
      using errcode = '22000';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'active' then
      -- Re-consent is still consent: only the student can switch it back on.
      if auth.uid() is distinct from old.student_id then
        raise exception 'workspace_students: only the student can restore a link'
          using errcode = '42501';
      end if;
      new.ended_at := null;
      new.ended_by := null;
      new.joined_at := now();
    elsif new.status = 'revoked' then
      if auth.uid() is distinct from old.student_id then
        raise exception 'workspace_students: only the student can revoke their own link'
          using errcode = '42501';
      end if;
      new.ended_at := coalesce(new.ended_at, now());
      new.ended_by := old.student_id;
    elsif new.status = 'removed' then
      if auth.uid() is distinct from v_owner then
        raise exception 'workspace_students: only the workspace owner can remove a student'
          using errcode = '42501';
      end if;
      new.ended_at := coalesce(new.ended_at, now());
      new.ended_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

create trigger workspace_students_guard_trg
  before insert or update on workspace_students
  for each row execute function workspace_students_guard();

create or replace function workspace_staff_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from teacher_workspaces where id = new.workspace_id;

  if tg_op = 'INSERT' then
    if new.staff_role = 'owner' then
      -- The owner row is born with the workspace and belongs to its owner.
      if new.user_id is distinct from v_owner then
        raise exception 'workspace_staff: the owner row must belong to the workspace owner'
          using errcode = '22000';
      end if;
    else
      -- An assistant joins for themselves, and arrives pending.
      if new.user_id is distinct from auth.uid() then
        raise exception 'workspace_staff: an assistant row can only be created by that assistant'
          using errcode = '42501';
      end if;
      if new.status <> 'pending' then
        raise exception 'workspace_staff: an assistant is always born pending'
          using errcode = '22000';
      end if;
    end if;
    if exists (select 1 from workspace_students ws
               where ws.workspace_id = new.workspace_id
                 and ws.student_id = new.user_id
                 and ws.status = 'active') then
      raise exception 'workspace_staff: this account is an enrolled student in this workspace'
        using errcode = '22000';
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if new.workspace_id is distinct from old.workspace_id
     or new.user_id is distinct from old.user_id
     or new.staff_role is distinct from old.staff_role then
    raise exception 'workspace_staff: workspace_id, user_id and staff_role are immutable'
      using errcode = '22000';
  end if;

  if new.status is distinct from old.status then
    if old.staff_role = 'owner' then
      raise exception 'workspace_staff: the owner row cannot change status'
        using errcode = '42501';
    end if;
    -- Activation is the whole safety gate on the staff code. Only the owner.
    if auth.uid() is distinct from v_owner then
      raise exception 'workspace_staff: only the workspace owner can change staff status'
        using errcode = '42501';
    end if;
    if new.status = 'active' then
      new.activated_at := coalesce(new.activated_at, now());
      new.activated_by := auth.uid();
    elsif new.status = 'removed' then
      new.removed_at := coalesce(new.removed_at, now());
      new.removed_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

create trigger workspace_staff_guard_trg
  before insert or update on workspace_staff
  for each row execute function workspace_staff_guard();

-- ── 8 · RLS on, doors shut ───────────────────────────────────────────────
-- Enabled here with no policy at all, which means closed to every client role.
-- 20260830b opens exactly the reads that should be open, and no writes.

alter table teacher_workspaces   enable row level security;
alter table workspace_staff      enable row level security;
alter table workspace_students   enable row level security;
alter table workspace_audit_log  enable row level security;

-- The guard and code helpers are internal. This project defines a DEFAULT ACL
-- on public functions that grants EXECUTE to anon and authenticated, so a bare
-- CREATE FUNCTION is callable by anyone logged in — revoking is not optional.
revoke all on function workspace_new_code()       from public, anon, authenticated;
revoke all on function workspace_students_guard() from public, anon, authenticated;
revoke all on function workspace_staff_guard()    from public, anon, authenticated;

commit;
