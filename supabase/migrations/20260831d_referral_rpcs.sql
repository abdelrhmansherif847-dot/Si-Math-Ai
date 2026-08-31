-- =====================================================================
-- Teacher Partner Program — 3 of 4: attribution, teacher reads, admin writes
-- =====================================================================
-- STATUS: 🟢 APPLIED 2026-08-31 as version 20260831120608, with explicit owner approval.
-- DEPENDS ON: 20260831b, 20260831c
--
-- Every function below revokes the default ACL before granting deliberately:
-- a new function in this project is granted to anon and authenticated unless
-- told otherwise, and a referral read reachable by anon would be a public list
-- of who pays whom.
-- =====================================================================

begin;

-- ── who is a teacher? the existing relationship, asked once ──────────────
create or replace function is_active_teacher(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from workspace_staff s
    join teacher_workspaces w on w.id = s.workspace_id
    where s.user_id = p_user and s.staff_role = 'teacher'
      and s.status = 'active' and w.is_active
  );
$$;

comment on function is_active_teacher(uuid) is
  'Partner eligibility, and nothing more than the teacher relationship that '
  'already exists. There is no partner role and no rung on user_role — being a '
  'teacher is holding an active teacher staff row, exactly as 20260830a/h '
  'define it. An ASSISTANT is not a teacher and never passes this.';

-- ── a teacher claims their code ──────────────────────────────────────────
create or replace function teacher_referral_code()
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  i      int;
begin
  if v_uid is null or not is_active_teacher(v_uid) then
    raise exception 'teacher_referral_code: teachers only' using errcode = '42501';
  end if;

  select code into v_code from referral_codes where teacher_user_id = v_uid;
  if v_code is not null then return v_code; end if;

  -- Reuses workspace_new_code(): same 8-character unambiguous alphabet the
  -- classroom codes already use, so a teacher reads one kind of code, not two.
  for i in 1..12 loop
    begin
      v_code := workspace_new_code();
      insert into referral_codes (teacher_user_id, code) values (v_uid, v_code);
      return v_code;
    exception when unique_violation then
      -- Could be the code (retry) or the teacher (someone raced us; take theirs).
      select code into v_code from referral_codes where teacher_user_id = v_uid;
      if v_code is not null then return v_code; end if;
    end;
  end loop;
  raise exception 'teacher_referral_code: could not allocate a code' using errcode = '55000';
end;
$$;

-- ── attribution: last touch while unpaid, permanent once paid ────────────
create or replace function attribute_referral(p_code text, p_source text default 'code_entry')
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid     uuid := auth.uid();
  v_norm    text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_teacher uuid;
  v_existing referral_attributions%rowtype;
  /* FOUND is clobbered by PERFORM, EXECUTE and every other statement that
     follows a SELECT INTO. Capturing it immediately is not defensive style —
     a dry run proved that without this the first attribution takes the UPDATE
     branch, updates zero rows, and reports success while binding nobody. */
  v_had_row boolean;
begin
  if v_uid is null then
    raise exception 'attribute_referral: sign in first' using errcode = '42501';
  end if;
  if p_source not in ('signup_link','code_entry') then
    raise exception 'attribute_referral: invalid source' using errcode = '22023';
  end if;

  select teacher_user_id into v_teacher from referral_codes where code = v_norm and active;
  if v_teacher is null then
    -- One message for "no such code" and "deactivated" on purpose: the
    -- difference is not the student's business, and telling them turns this
    -- into an oracle for which codes exist.
    return jsonb_build_object('ok', false, 'reason', 'unknown_code');
  end if;
  if v_teacher = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'own_code');
  end if;

  -- An account that has ALREADY bought something can never be attributed.
  -- Without this a teacher collects commission on a customer the platform had
  -- already won, by handing their code to an existing paying student.
  if exists (select 1 from purchase_events where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_purchased');
  end if;

  select * into v_existing from referral_attributions where student_user_id = v_uid;
  v_had_row := found;

  if v_had_row and v_existing.locked_at is not null then
    -- Deliberately does not name the holding teacher: that would leak which
    -- students belong to whom.
    return jsonb_build_object('ok', false, 'reason', 'already_locked');
  end if;

  perform set_config('si.referral_rpc', 'on', true);
  if v_had_row then
    -- LAST TOUCH while the student is still unpaid.
    update referral_attributions
       set teacher_user_id = v_teacher, code = v_norm,
           source = p_source, attributed_at = now()
     where student_user_id = v_uid;
  else
    insert into referral_attributions (student_user_id, teacher_user_id, code, source)
    values (v_uid, v_teacher, v_norm, p_source);
  end if;
  perform set_config('si.referral_rpc', 'off', true);

  return jsonb_build_object('ok', true,
    'reason', case when v_had_row then 'reattributed' else 'attributed' end);
end;
$$;

comment on function attribute_referral(text, text) is
  'Binds a student to a teacher. LAST TOUCH while the student has no purchase '
  'event: a pending code has no weight, and the teacher who walked the student '
  'to the point of paying is the one who converted them. Once the first '
  'purchase locks the row, only admin_reassign_referral() can move it, and it '
  'audits. Never silently overrides a locked attribution.';

-- ── the teacher's own numbers ────────────────────────────────────────────
create or replace function teacher_referral_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
  v_rate referral_commission_rates%rowtype;
  v_next referral_commission_rates%rowtype;
begin
  if v_uid is null or not is_active_teacher(v_uid) then
    raise exception 'teacher_referral_summary: teachers only' using errcode = '42501';
  end if;

  select count(*) into v_n from referral_commissions
   where teacher_user_id = v_uid and status <> 'reversed';

  -- The tier a teacher IS on is the one their next award would use, which is
  -- the band containing n+1 while n is 0. greatest() keeps the entry band.
  select * into v_rate from referral_commission_rates
   where min_paid_students <= greatest(v_n, 1)
     and (max_paid_students is null or max_paid_students >= greatest(v_n, 1));

  select * into v_next from referral_commission_rates
   where min_paid_students > greatest(v_n, 1)
   order by min_paid_students limit 1;

  return jsonb_build_object(
    'code',              (select code from referral_codes where teacher_user_id = v_uid),
    'referred_count',    (select count(*) from referral_attributions where teacher_user_id = v_uid),
    'paid_count',        v_n,
    'tier_label',        v_rate.label,
    'rate_bps',          v_rate.rate_bps,
    'next_tier_label',   v_next.label,
    'next_tier_at',      v_next.min_paid_students,
    'students_to_next',  case when v_next.min_paid_students is null then null
                              else v_next.min_paid_students - v_n end,
    'gross_generated',   coalesce((select sum(gross_egp) from referral_commissions
                                    where teacher_user_id = v_uid and status <> 'reversed'), 0),
    'earned',            coalesce((select sum(commission_egp) from referral_commissions
                                    where teacher_user_id = v_uid and status <> 'reversed'), 0),
    'pending',           coalesce((select sum(commission_egp) from referral_commissions
                                    where teacher_user_id = v_uid and status = 'pending'), 0),
    'approved',          coalesce((select sum(commission_egp) from referral_commissions
                                    where teacher_user_id = v_uid and status = 'approved'), 0),
    'paid',              coalesce((select sum(commission_egp) from referral_commissions
                                    where teacher_user_id = v_uid and status = 'paid'), 0),
    'reversed',          coalesce((select sum(commission_egp) from referral_commissions
                                    where teacher_user_id = v_uid and status = 'reversed'), 0));
end;
$$;

comment on function teacher_referral_summary() is
  'Caller-scoped: a teacher passes no id and can read only their own numbers. '
  'available balance is approved-and-not-yet-paid, which the page derives; it '
  'is not a promise of a payment date.';

create or replace function teacher_referral_students()
returns table (
  student_id     uuid,
  full_name      text,
  attributed_at  timestamptz,
  has_paid       boolean,
  purchase_at    timestamptz,
  plan_code      text,
  gross_egp      numeric,
  commission_egp numeric,
  status         text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not is_active_teacher(v_uid) then
    raise exception 'teacher_referral_students: teachers only' using errcode = '42501';
  end if;

  -- Non-sensitive only. No email, no screenshot_url, no reference_note, no
  -- payment method — a teacher is owed their commission, not their student's
  -- payment paperwork.
  return query
  select a.student_user_id,
         coalesce(p.full_name, 'Student'),
         a.attributed_at,
         c.id is not null,
         c.awarded_at,
         c.plan_code,
         c.gross_egp,
         c.commission_egp,
         c.status
    from referral_attributions a
    left join profiles p            on p.id = a.student_user_id
    left join referral_commissions c on c.student_user_id = a.student_user_id
   where a.teacher_user_id = v_uid
   order by c.awarded_at desc nulls last, a.attributed_at desc, a.student_user_id;
end;
$$;

-- ── admin: transition, never delete ──────────────────────────────────────
create or replace function admin_set_commission_status(
  p_commission uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  c referral_commissions%rowtype;
  v_payouts_on text;
begin
  if not has_role_at_least('admin') then
    raise exception 'admin_set_commission_status: admins only' using errcode = '42501';
  end if;
  if p_status not in ('pending','approved','paid','reversed') then
    raise exception 'admin_set_commission_status: unknown status %', p_status using errcode = '22023';
  end if;

  select * into c from referral_commissions where id = p_commission;
  if not found then raise exception 'commission not found' using errcode = '02000'; end if;

  /* A commission is NOT marked paid until the tax and withholding treatment is
     confirmed by the business. That is a settings flag rather than a comment,
     so the rule holds even when nobody remembers it. Turn it on with:
       select admin_set_system_setting('referral_payouts_enabled','true')
     — or whatever the owner's settings path is — once the treatment is known. */
  if p_status = 'paid' then
    select value into v_payouts_on from system_settings where key = 'referral_payouts_enabled';
    if coalesce(v_payouts_on, 'false') <> 'true' then
      raise exception 'Payouts are not enabled: confirm the VAT and withholding treatment first, then set referral_payouts_enabled = true'
        using errcode = '42501';
    end if;
  end if;

  if p_status = 'reversed' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reversal needs a reason' using errcode = '22023';
  end if;

  perform set_config('si.referral_rpc', 'on', true);
  update referral_commissions
     set status          = p_status,
         approved_at     = case when p_status = 'approved' then now() else approved_at end,
         approved_by     = case when p_status = 'approved' then auth.uid() else approved_by end,
         paid_at         = case when p_status = 'paid'     then now() else paid_at end,
         paid_by         = case when p_status = 'paid'     then auth.uid() else paid_by end,
         reversed_at     = case when p_status = 'reversed' then now() else reversed_at end,
         reversed_by     = case when p_status = 'reversed' then auth.uid() else reversed_by end,
         reversal_reason = case when p_status = 'reversed' then p_reason else reversal_reason end
   where id = p_commission;
  perform set_config('si.referral_rpc', 'off', true);

  insert into referral_audit_log (actor_id, action, subject_id, meta)
  values (auth.uid(), 'commission_' || p_status, p_commission,
          jsonb_build_object('from', c.status, 'to', p_status, 'reason', p_reason));

  return jsonb_build_object('ok', true, 'from', c.status, 'to', p_status);
end;
$$;

comment on function admin_set_commission_status(uuid, text, text) is
  'The only way a commission changes state. Refuses to mark anything paid '
  'while referral_payouts_enabled is not true — the brief is explicit that '
  'nothing is paid before the tax treatment is confirmed, so that is a gate, '
  'not a note. Every transition is audited. Nothing is ever deleted.';

create or replace function admin_reassign_referral(
  p_student uuid, p_teacher uuid, p_reason text, p_force boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  a referral_attributions%rowtype;
  v_had_row boolean;   -- see attribute_referral: PERFORM clobbers FOUND
begin
  if not has_role_at_least('admin') then
    raise exception 'admin_reassign_referral: admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reassignment needs a reason' using errcode = '22023';
  end if;
  if p_student = p_teacher then
    raise exception 'a teacher cannot be their own referral' using errcode = '22023';
  end if;
  if not is_active_teacher(p_teacher) then
    raise exception 'the destination account is not an active teacher' using errcode = '22023';
  end if;

  select * into a from referral_attributions where student_user_id = p_student;
  v_had_row := found;

  perform set_config('si.referral_rpc', 'on', true);
  if not v_had_row then
    insert into referral_attributions (student_user_id, teacher_user_id, code, source, note)
    values (p_student, p_teacher,
            coalesce((select code from referral_codes where teacher_user_id = p_teacher), 'ADMIN'),
            'admin', p_reason);
  else
    if a.locked_at is not null and not p_force then
      perform set_config('si.referral_rpc', 'off', true);
      raise exception 'this attribution is locked by a completed purchase; pass force to override, and say why'
        using errcode = '42501';
    end if;
    update referral_attributions
       set teacher_user_id = p_teacher, source = 'admin', note = p_reason
     where student_user_id = p_student;
  end if;
  perform set_config('si.referral_rpc', 'off', true);

  insert into referral_audit_log (actor_id, action, subject_id, meta)
  values (auth.uid(), 'referral_reassigned', p_student,
          jsonb_build_object('from', a.teacher_user_id, 'to', p_teacher,
                             'was_locked', a.locked_at is not null,
                             'forced', p_force, 'reason', p_reason));

  return jsonb_build_object('ok', true);
end;
$$;

comment on function admin_reassign_referral(uuid, uuid, text, boolean) is
  'The ONLY way an attribution moves after it locks, and it never moves '
  'silently: a reason is mandatory, a locked row needs an explicit force, and '
  'both the old and new teacher are written to the audit log. Reassigning does '
  'NOT move an already-awarded commission — that is a separate, deliberate '
  'admin act, so money never follows a correction by accident.';

-- ── admin read ───────────────────────────────────────────────────────────
create or replace function admin_referral_overview()
returns table (
  teacher_user_id uuid,
  full_name       text,
  code            text,
  referred        bigint,
  paid            bigint,
  earned          numeric,
  pending         numeric,
  paid_out        numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not has_role_at_least('admin') then
    raise exception 'admin_referral_overview: admins only' using errcode = '42501';
  end if;
  return query
  select rc.teacher_user_id,
         coalesce(p.full_name, 'Teacher'),
         rc.code,
         (select count(*) from referral_attributions a where a.teacher_user_id = rc.teacher_user_id),
         (select count(*) from referral_commissions c
           where c.teacher_user_id = rc.teacher_user_id and c.status <> 'reversed'),
         coalesce((select sum(c.commission_egp) from referral_commissions c
                    where c.teacher_user_id = rc.teacher_user_id and c.status <> 'reversed'), 0),
         coalesce((select sum(c.commission_egp) from referral_commissions c
                    where c.teacher_user_id = rc.teacher_user_id and c.status = 'pending'), 0),
         coalesce((select sum(c.commission_egp) from referral_commissions c
                    where c.teacher_user_id = rc.teacher_user_id and c.status = 'paid'), 0)
    from referral_codes rc
    left join profiles p on p.id = rc.teacher_user_id
   order by 6 desc, 2;
end;
$$;

-- ── privileges: revoke the default ACL, then grant deliberately ──────────
revoke all on function is_active_teacher(uuid)                                from public, anon, authenticated;
revoke all on function teacher_referral_code()                                from public, anon, authenticated;
revoke all on function attribute_referral(text, text)                         from public, anon, authenticated;
revoke all on function teacher_referral_summary()                             from public, anon, authenticated;
revoke all on function teacher_referral_students()                            from public, anon, authenticated;
revoke all on function admin_set_commission_status(uuid, text, text)          from public, anon, authenticated;
revoke all on function admin_reassign_referral(uuid, uuid, text, boolean)     from public, anon, authenticated;
revoke all on function admin_referral_overview()                              from public, anon, authenticated;

grant execute on function teacher_referral_code()                             to authenticated;
grant execute on function attribute_referral(text, text)                      to authenticated;
grant execute on function teacher_referral_summary()                          to authenticated;
grant execute on function teacher_referral_students()                         to authenticated;
grant execute on function admin_set_commission_status(uuid, text, text)       to authenticated;
grant execute on function admin_reassign_referral(uuid, uuid, text, boolean)  to authenticated;
grant execute on function admin_referral_overview()                           to authenticated;
-- is_active_teacher() stays internal: it is a helper for the functions above
-- and for RLS, not a surface. Nothing outside this schema needs to ask it.

-- Payouts start OFF. See admin_set_commission_status().
insert into system_settings (key, value)
values ('referral_payouts_enabled', 'false')
on conflict (key) do nothing;

commit;
