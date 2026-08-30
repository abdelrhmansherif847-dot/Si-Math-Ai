-- Behaviour verification for 20260830e, run against a real PostgreSQL with
-- 20260830a..e applied. Every assertion below can fail; several did while this
-- file was being written, which is the only reason to trust the ones that pass.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create or replace function t_assert(label text, cond boolean) returns void
language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERT-FAIL: %', label; end if;
  raise notice '  PASS  %', label;
end $$;

/* Runs stmt as p_uid in role p_role and expects it to be REFUSED. A statement
   that succeeds is the failure. */
create or replace function t_refuses(label text, p_uid uuid, p_role text, stmt text, want text default null)
returns void language plpgsql as $$
declare got text;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('test.uid', coalesce(p_uid::text, ''), true);
    execute stmt;
    reset role;
    raise exception 'ASSERT-FAIL: % — it was allowed', label;
  exception when others then
    got := sqlstate;
    reset role;
    if sqlerrm like 'ASSERT-FAIL%' then raise; end if;
    if want is not null and got <> want then
      raise exception 'ASSERT-FAIL: % — refused with % but wanted %  (%)', label, got, want, sqlerrm;
    end if;
    raise notice '  PASS  %  [%]', label, got;
  end;
end $$;

/* Runs stmt as p_uid and expects it to be ALLOWED. */
create or replace function t_allows(label text, p_uid uuid, p_role text, stmt text)
returns void language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  perform set_config('test.uid', coalesce(p_uid::text, ''), true);
  execute stmt;
  reset role;
  raise notice '  PASS  %', label;
exception when others then
  reset role;
  raise exception 'ASSERT-FAIL: % — refused with % (%)', label, sqlstate, sqlerrm;
end $$;

/* Counts rows visible to p_uid under RLS. */
create or replace function t_visible(p_uid uuid, q text) returns integer
language plpgsql as $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('test.uid', p_uid::text, true);
  execute q into n;
  reset role;
  return n;
end $$;

begin;

-- ── cast ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 't@x'),   -- teacher
  ('22222222-2222-2222-2222-222222222222', 'a@x'),   -- assistant
  ('33333333-3333-3333-3333-333333333333', 's1@x'),  -- student in the class
  ('44444444-4444-4444-4444-444444444444', 's2@x'),  -- student NOT in the class
  ('55555555-5555-5555-5555-555555555555', 'o@x');   -- unrelated account
insert into profiles (id, full_name, exam_type) values
  ('11111111-1111-1111-1111-111111111111', 'Teacher',   null),
  ('22222222-2222-2222-2222-222222222222', 'Assistant', null),
  ('33333333-3333-3333-3333-333333333333', 'Student One', 'EST'),
  ('44444444-4444-4444-4444-444444444444', 'Student Two', 'SAT'),
  ('55555555-5555-5555-5555-555555555555', 'Outsider',  null);

-- Workspaces are admin-created (20260830c, open question 7). The admin is the
-- one acting here, so created_by is theirs.
insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999', 'admin@x');
insert into profiles (id, full_name, role) values ('99999999-9999-9999-9999-999999999999', 'Admin', 'admin');
set local test.is_admin = 'on';
set local test.uid = '99999999-9999-9999-9999-999999999999';
select teacher_create_workspace('11111111-1111-1111-1111-111111111111', 'EST Math — Saturday') as ws \gset
set local test.is_admin = 'off';
set local test.uid = '';

select student_join_code as scode, staff_join_code as fcode
  from teacher_workspaces where id = :'ws' \gset

-- The student joins (only they can), the assistant asks and is approved.
select t_allows('setup · the student joins by code',
  '33333333-3333-3333-3333-333333333333', 'authenticated',
  format('select student_join_workspace(%L)', :'scode'));
select t_allows('setup · the assistant asks to join',
  '22222222-2222-2222-2222-222222222222', 'authenticated',
  format('select staff_join_workspace(%L)', :'fcode'));
select id as staffid from workspace_staff
 where user_id = '22222222-2222-2222-2222-222222222222' \gset
select t_allows('setup · the teacher approves the assistant',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format('select teacher_set_staff_status(%L::uuid, %L::workspace_staff_status)', :'staffid', 'active'));

\echo ''
\echo '── who may record ──'

select t_allows('the owner records an intervention',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format($q$select teacher_record_intervention(%L::uuid, %L::uuid, 'retaught', 'Systems of Equations',
          'ALGEBRA', 'ALG_007', 'Went over substitution again in class.')$q$,
         :'ws', '33333333-3333-3333-3333-333333333333'));

select t_refuses('the assistant may not record',
  '22222222-2222-2222-2222-222222222222', 'authenticated',
  format($q$select teacher_record_intervention(%L::uuid, %L::uuid, 'retaught', 'Systems of Equations')$q$,
         :'ws', '33333333-3333-3333-3333-333333333333'), '42501');

select t_refuses('an unrelated account may not record',
  '55555555-5555-5555-5555-555555555555', 'authenticated',
  format($q$select teacher_record_intervention(%L::uuid, %L::uuid, 'retaught', 'Systems of Equations')$q$,
         :'ws', '33333333-3333-3333-3333-333333333333'), '42501');

select t_refuses('the owner may not record about a student who is not in the class',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format($q$select teacher_record_intervention(%L::uuid, %L::uuid, 'retaught', 'Systems of Equations')$q$,
         :'ws', '44444444-4444-4444-4444-444444444444'), '42501');

\echo ''
\echo '── the dates ──'

select t_refuses('a record dated in the future is refused',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format($q$select teacher_record_intervention(%L::uuid, %L::uuid, 'spoke_with', 'Circles',
          null, null, null, current_date + 1)$q$, :'ws', '33333333-3333-3333-3333-333333333333'), '22023');

select t_refuses('a backdate beyond the window is refused',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format($q$select teacher_record_intervention(%L::uuid, %L::uuid, 'spoke_with', 'Circles',
          null, null, null, current_date - 31)$q$, :'ws', '33333333-3333-3333-3333-333333333333'), '22023');

select t_allows('a backdate inside the window is allowed',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format($q$select teacher_record_intervention(%L::uuid, %L::uuid, 'spoke_with', 'Circles',
          null, null, null, current_date - 30)$q$, :'ws', '33333333-3333-3333-3333-333333333333'));

\echo ''
\echo '── the taxonomy is a real reference, not decoration ──'

select t_refuses('a subtopic with no topic is refused',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format($q$select teacher_record_intervention(%L::uuid, %L::uuid, 'retaught', 'Orphan',
          null, 'ALG_006')$q$, :'ws', '33333333-3333-3333-3333-333333333333'), '23514');

select t_refuses('a subtopic outside the taxonomy is refused',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format($q$select teacher_record_intervention(%L::uuid, %L::uuid, 'retaught', 'Invented',
          'ALGEBRA', 'ALG_999')$q$, :'ws', '33333333-3333-3333-3333-333333333333'), '23503');

select t_allows('a weakness with no canonical id is still recordable, by label',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format($q$select teacher_record_intervention(%L::uuid, %L::uuid, 'assigned_practice',
          'Linear Word Problems')$q$, :'ws', '33333333-3333-3333-3333-333333333333'));

\echo ''
\echo '── append-only, including for the superuser ──'

select id as rec from class_interventions where kind = 'retaught' limit 1 \gset

select t_refuses('nobody may delete a record — not even postgres',
  null, 'postgres', format('delete from class_interventions where id = %L', :'rec'), '42501');

select t_refuses('the note cannot be edited',
  null, 'postgres',
  format($q$update class_interventions set note = 'rewritten' where id = %L$q$, :'rec'), '42501');

select t_refuses('a withdrawal may not smuggle in another change',
  null, 'postgres',
  format($q$update class_interventions set withdrawn_at = now(),
           withdrawn_by = %L, subject_label = 'something else' where id = %L$q$,
         '11111111-1111-1111-1111-111111111111', :'rec'), '42501');

select t_allows('the owner may withdraw',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format('select teacher_withdraw_intervention(%L::uuid)', :'rec'));

select t_assert('a withdrawn record is still there, dated',
  (select withdrawn_at is not null and note is not null from class_interventions where id = :'rec'));

select t_refuses('a record cannot be withdrawn twice',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format('select teacher_withdraw_intervention(%L::uuid)', :'rec'), '22023');

\echo ''
\echo '── who may read ──'

select t_assert('the teacher sees all three records',
  t_visible('11111111-1111-1111-1111-111111111111',
            'select count(*)::int from class_interventions') = 3);
select t_assert('the assistant sees the same three',
  t_visible('22222222-2222-2222-2222-222222222222',
            'select count(*)::int from class_interventions') = 3);
select t_assert('the student sees what is held about them, withdrawn row included',
  t_visible('33333333-3333-3333-3333-333333333333',
            'select count(*)::int from class_interventions') = 3);
select t_assert('a student not in the class sees nothing',
  t_visible('44444444-4444-4444-4444-444444444444',
            'select count(*)::int from class_interventions') = 0);
select t_assert('an unrelated account sees nothing',
  t_visible('55555555-5555-5555-5555-555555555555',
            'select count(*)::int from class_interventions') = 0);

select t_assert('student_my_interventions returns the student their own record',
  t_visible('33333333-3333-3333-3333-333333333333',
            'select count(*)::int from student_my_interventions()') = 3);
select t_assert('student_my_interventions returns nothing to someone else',
  t_visible('44444444-4444-4444-4444-444444444444',
            'select count(*)::int from student_my_interventions()') = 0);

select t_assert('the assistant can read the record through the RPC',
  t_visible('22222222-2222-2222-2222-222222222222',
            format('select count(*)::int from teacher_student_interventions(%L::uuid, %L::uuid)',
                   :'ws', '33333333-3333-3333-3333-333333333333')) = 3);

select t_refuses('the RPC refuses a student who is not in the workspace',
  '11111111-1111-1111-1111-111111111111', 'authenticated',
  format('select * from teacher_student_interventions(%L::uuid, %L::uuid)',
         :'ws', '44444444-4444-4444-4444-444444444444'), '42501');

\echo ''
\echo '── the boundary in §8.3, checked rather than asserted ──'

select t_assert('class_interventions holds no foreign key into any academic table',
  not exists (
    select 1 from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      join pg_class tgt on tgt.oid = c.confrelid
     where src.relname = 'class_interventions' and c.contype = 'f'
       and tgt.relname in ('weakness_reports','weakness_signals','mastery_records',
                           'question_records','session_questions','focus_tasks','focus_plans',
                           'exam_practice_sessions','exam_mistakes','study_plans','profiles')));

select t_assert('the only tables it references are the workspace, the taxonomy and auth.users',
  (select array_agg(distinct tgt.relname::text order by tgt.relname::text)
     from pg_constraint c
     join pg_class src on src.oid = c.conrelid
     join pg_class tgt on tgt.oid = c.confrelid
    where src.relname = 'class_interventions' and c.contype = 'f')
  = array['taxonomy_subtopics','taxonomy_topics','teacher_workspaces','users']);

select t_assert('anon holds nothing on the table',
  not has_table_privilege('anon', 'class_interventions', 'select'));
select t_assert('authenticated may select but never write directly',
  has_table_privilege('authenticated', 'class_interventions', 'select')
  and not has_table_privilege('authenticated', 'class_interventions', 'insert')
  and not has_table_privilege('authenticated', 'class_interventions', 'update')
  and not has_table_privilege('authenticated', 'class_interventions', 'delete'));

\echo ''
\echo '── no regression in what was already live ──'

insert into weakness_reports (user_id, topic, subtopic, severity_band, priority_rank, total_signals, trend)
values ('33333333-3333-3333-3333-333333333333', 'Algebra', 'Systems of Equations', 'high', 1, 9, null);
select t_assert('the weakness read still works and still withholds a null trend',
  t_visible('11111111-1111-1111-1111-111111111111',
            format('select count(*)::int from teacher_student_weaknesses(%L::uuid, %L::uuid) where trend is null',
                   :'ws', '33333333-3333-3333-3333-333333333333')) = 1);

rollback;
