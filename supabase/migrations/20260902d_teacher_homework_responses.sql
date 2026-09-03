-- =====================================================================
-- Teacher Homework, increment H2.3 — the per-item answer record
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-09-03 as version 20260903123458. Third and last file
--         of the ATOMIC H2 SCHEMA PACKAGE: 20260902b, then 20260902c, then this,
--         all of them or none. Rollback: 20260902y, which undoes all three.
-- DEPENDS ON: 20260902b (the five tables, and the two `unique (id, homework_id)`
--             keys this file's composite foreign keys point at) and 20260902c
--             (teacher_homework_is_staff(), used by the staff policy below).
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.15a — the design
--          audited against the two LIVE models, teacher_exam_responses (3b) and
--          the platform's own exam_responses, and approved 2026-09-02.
--
-- WHAT THIS IS. One row per (attempt, question): the answer a student gave and
-- whether it was right. Without it H5 can neither save nor grade, which is why
-- it is applied WITH the rest of the package rather than bolted on afterwards.
--
-- THE STRUCTURAL INVARIANT, AND WHY IT IS A FOREIGN KEY
-- ----------------------------------------------------
-- An answer must join an attempt and a question OF THE SAME HOMEWORK. In the
-- exam model nothing prevents a response row that names an attempt of exam A
-- and a question of exam B — it is correct only because the RPC builds the
-- rows, and an RPC is code someone can change. Here the rule is two composite
-- FOREIGN KEYS onto the keys 20260902b added, so the database refuses the
-- mismatch itself. A trigger was the alternative and was rejected: a later
-- migration can drop a trigger without the diff looking like a change of rule.
--
-- homework_id is therefore denormalised onto this row. It needs no foreign key
-- of its own to teacher_homework: (attempt_id, homework_id) must match an
-- attempts row, and that row's homework_id already references the paper.
--
-- WHAT IS DELIBERATELY ABSENT, AGAINST 3b'S SHAPE
-- -----------------------------------------------
--   ms_on_item, visit_count, first_seen_at
--       Homework is untimed and resumable across days. A millisecond total
--       accumulated over a week with a tab left open measures nothing, and a
--       revisit count over days is not the quantity a revisit inside a timed
--       sitting is. Both are numbers the first surface to find them would read
--       as pacing evidence — exactly what decision 2 forbids. With no visit
--       tracking first_seen_at collapses into the first write of
--       last_answered_at and earns no column.
--   any taxonomy, difficulty, skill or origin column
--       As for teacher_homework_questions: an unmapped, uncalibrated item is
--       given no column in which to pretend otherwise. That is what keeps
--       homework structurally outside the analyzer.
-- =====================================================================

begin;

-- ── 1 · the answer record ─────────────────────────────────────────────
create table teacher_homework_responses (
  id               uuid primary key default gen_random_uuid(),
  attempt_id       uuid not null,
  question_id      uuid not null,
  homework_id      uuid not null,
  ordinal          integer not null,
  answer           text,
  is_correct       boolean,
  last_answered_at timestamptz,

  constraint teacher_homework_responses_slot_uq unique (attempt_id, question_id),
  constraint teacher_homework_responses_ordinal_check check (ordinal > 0),
  constraint teacher_homework_responses_answer_check
    check (answer is null or char_length(answer) <= 500),
  -- THE THREE-VALUED RULE, MADE STRUCTURAL. is_correct is true / false / NULL,
  -- and NULL means "not answered" — never "wrong". An unanswered item cannot be
  -- graded at all, so no future writer can record an omission as a mistake.
  constraint teacher_homework_responses_omission_check
    check (answer is not null or is_correct is null),

  -- The invariant, as constraints rather than as code.
  constraint teacher_homework_responses_attempt_fk
    foreign key (attempt_id, homework_id)
    references teacher_homework_attempts (id, homework_id) on delete cascade,
  constraint teacher_homework_responses_question_fk
    foreign key (question_id, homework_id)
    references teacher_homework_questions (id, homework_id) on delete restrict
);

comment on table teacher_homework_responses is
  'One row per (attempt, question): what the student answered and whether it '
  'was right. The pair of composite foreign keys makes "same homework" a '
  'database rule rather than an RPC convention. is_correct is three-valued: '
  'NULL means the item was never answered, which is not the same claim as '
  'wrong and must never be collapsed into it.';

comment on column teacher_homework_responses.homework_id is
  'Denormalised so the two composite foreign keys can exist. It needs no key of '
  'its own: the attempts row it must match already references the paper.';

-- Resume, and the staff view of one student's paper, both read a whole attempt
-- in order. The class view of one item reads the other way.
create index teacher_homework_responses_attempt_idx
  on teacher_homework_responses (attempt_id, ordinal);
create index teacher_homework_responses_question_idx
  on teacher_homework_responses (question_id);

-- ── 2 · the guard ─────────────────────────────────────────────────────
-- An answer is a record: never deleted, never re-graded, and frozen once the
-- attempt it belongs to is submitted.
create or replace function teacher_homework_responses_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'teacher_homework_responses: an answer is a record and is never deleted'
      using errcode = '42501';
  end if;

  if new.attempt_id is distinct from old.attempt_id
     or new.question_id is distinct from old.question_id
     or new.homework_id is distinct from old.homework_id
     or new.ordinal is distinct from old.ordinal then
    raise exception 'teacher_homework_responses: which item of which attempt is immutable'
      using errcode = '22000';
  end if;

  -- Graded once, and never re-graded: once is_correct holds a verdict, no later
  -- code path can quietly rewrite it.
  if old.is_correct is not null and new.is_correct is distinct from old.is_correct then
    raise exception 'teacher_homework_responses: this item is already graded'
      using errcode = '42501';
  end if;

  -- A submitted paper cannot be edited. H5 must therefore grade BEFORE it flips
  -- the attempt to submitted — the order teacher_exam_submit() already uses.
  -- Fails closed on an unreadable parent, which is why this is SECURITY DEFINER.
  if new.answer is distinct from old.answer then
    select status into v_status from teacher_homework_attempts where id = new.attempt_id;
    if v_status is null or v_status <> 'in_progress' then
      raise exception 'teacher_homework_responses: this attempt is % and its answers are final',
        coalesce(v_status, '(unknown)') using errcode = '42501';
    end if;
  end if;

  return new;
end;
$fn$;

create trigger teacher_homework_responses_guard_trg
  before update or delete on teacher_homework_responses
  for each row execute function teacher_homework_responses_guard();

revoke all on function teacher_homework_responses_guard() from public, anon, authenticated;

-- ── 3 · RLS, grants and the two reads ─────────────────────────────────
alter table teacher_homework_responses enable row level security;
revoke all on table teacher_homework_responses from anon, authenticated;
grant select on table teacher_homework_responses to authenticated;

-- The student's own answers. This is decision 1's per-item correctness: it is
-- NULL for every item until submit grades them, so nothing is disclosed early.
-- The teacher's explanation and the correct answer are NOT here — they live on
-- teacher_homework_questions, which students hold no policy on, and reach the
-- student only through H5's RPC, the key only while reveal_answers is true.
create policy teacher_homework_responses_own_read on teacher_homework_responses
  for select to authenticated
  using (exists (select 1 from teacher_homework_attempts a
                  where a.id = teacher_homework_responses.attempt_id
                    and a.user_id = auth.uid()));

-- Staff of the homework's workspace, and platform admins. The denormalised
-- homework_id lets this ask the question directly instead of joining back
-- through the attempt, as the exam policy has to.
create policy teacher_homework_responses_staff_read on teacher_homework_responses
  for select to authenticated
  using (teacher_homework_is_staff(homework_id) or has_role_at_least('admin'::user_role));

-- ── 4 · verification ──────────────────────────────────────────────────
-- Every assertion names what would breach it, so each one could go red.
do $$
declare v_bad text; v_n integer;
begin
  -- 4.1 the invariant is a pair of COMPOSITE foreign keys, not a trigger.
  select string_agg(conname || ' -> ' || confrelid::regclass::text || ' (' || array_length(conkey, 1)::text || ' cols)', ', ')
    into v_bad
    from pg_constraint
   where conrelid = 'teacher_homework_responses'::regclass and contype = 'f';
  if v_bad is null or v_bad !~ 'teacher_homework_responses_attempt_fk'
     or v_bad !~ 'teacher_homework_responses_question_fk' then
    raise exception 'H2.3: the two composite foreign keys are not both present: %', coalesce(v_bad, '(none)');
  end if;
  select count(*) into v_n from pg_constraint
   where conrelid = 'teacher_homework_responses'::regclass and contype = 'f' and array_length(conkey, 1) = 2;
  if v_n <> 2 then
    raise exception 'H2.3: expected 2 two-column foreign keys, found % — a single-column FK cannot express "same homework"', v_n;
  end if;

  -- 4.2 the parent keys they depend on really exist (so 4.1 cannot pass by luck)
  select string_agg(conrelid::regclass::text, ', ') into v_bad
    from pg_constraint
   where conname in ('teacher_homework_attempts_id_homework_uq', 'teacher_homework_questions_id_homework_uq')
     and contype = 'u';
  if v_bad is null or v_bad !~ 'teacher_homework_attempts' or v_bad !~ 'teacher_homework_questions' then
    raise exception 'H2.3: the (id, homework_id) keys from 20260902b are missing: %', coalesce(v_bad, '(none)');
  end if;

  -- 4.3 the three-valued rule is enforced, not merely intended
  if not exists (select 1 from pg_constraint
                  where conrelid = 'teacher_homework_responses'::regclass
                    and conname = 'teacher_homework_responses_omission_check') then
    raise exception 'H2.3: the omission CHECK is gone — an unanswered item could be recorded as wrong';
  end if;

  -- 4.4 no client write privilege, and anon holds nothing
  select string_agg(distinct g.grantee || ':' || g.privilege_type, ', ') into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = 'teacher_homework_responses'
     and (g.grantee = 'anon' or (g.grantee = 'authenticated' and g.privilege_type <> 'SELECT'));
  if v_bad is not null then
    raise exception 'H2.3: a client role holds more than it should: %', v_bad;
  end if;
  if not exists (select 1 from information_schema.role_table_grants
                  where table_schema = 'public' and table_name = 'teacher_homework_responses'
                    and grantee = 'authenticated' and privilege_type = 'SELECT') then
    raise exception 'H2.3: authenticated cannot read the answer record at all';
  end if;

  -- 4.5 RLS on, exactly two policies, both SELECT
  if not (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'teacher_homework_responses') then
    raise exception 'H2.3: RLS is not enabled on teacher_homework_responses';
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'teacher_homework_responses';
  if v_n <> 2 then
    raise exception 'H2.3: expected 2 policies on the answer record, found %', v_n;
  end if;
  select string_agg(p.polname, ', ') into v_bad from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'teacher_homework_responses' and p.polcmd <> 'r';
  if v_bad is not null then
    raise exception 'H2.3: a non-SELECT policy exists on the answer record: %', v_bad;
  end if;

  -- 4.6 the package now stands at six tables and nine policies
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_homework%' and c.relkind = 'r';
  if v_n <> 6 then
    raise exception 'H2.3: expected 6 teacher-homework tables after the package, found %', v_n;
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname like 'teacher\_homework%';
  if v_n <> 9 then
    raise exception 'H2.3: expected 9 teacher-homework policies after the package, found %', v_n;
  end if;
end $$;

commit;
