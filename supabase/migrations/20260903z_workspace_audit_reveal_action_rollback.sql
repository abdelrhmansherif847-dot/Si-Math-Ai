-- =====================================================================
-- Rollback for 20260903a — and it is NOT a clean undo
-- =====================================================================
-- STATUS: 🔴 PREPARED, deliberately unapplied.
--
-- PostgreSQL has no ALTER TYPE ... DROP VALUE, so removing an enum label means
-- dropping and recreating the type around a live column. That is what this
-- does, and it is written out rather than pretended: the same posture
-- 20260902z and 20260901y take, for the same reason.
--
-- It refuses outright if any row already records the label, because a rollback
-- that silently discards history is not a rollback. And its window closes the
-- moment 20260903b ships: once teacher_homework_reveal_answers() exists and can
-- write the label, undoing the label means undoing the RPC first.
-- =====================================================================

begin;

-- ── 1 · refuse loudly rather than silently discard history ────────────
do $$
declare v_n integer;
begin
  select count(*) into v_n from workspace_audit_log
   where action::text = any (array['homework_answers_revealed']);
  if v_n > 0 then
    raise exception
      'rollback refused: % audit row(s) already record homework_answers_revealed. Dropping the label '
      'would erase them — decide that explicitly, not by running a rollback script.', v_n;
  end if;
end $$;

-- ── 2 · widen, rebuild, narrow ────────────────────────────────────────
alter table workspace_audit_log
  alter column action type text;

drop type workspace_audit_action;

create type workspace_audit_action as enum (
  'workspace_created',
  'join_code_rotated',
  'student_joined',
  'student_left',
  'student_removed',
  'staff_joined',
  'staff_activated',
  'staff_removed',
  'exam_created',
  'exam_published',
  'exam_closed',
  'exam_code_rotated',
  'exam_access_requested',
  'exam_access_approved',
  'exam_access_rejected',
  'exam_access_revoked',
  'homework_created',
  'homework_published',
  'homework_closed',
  'homework_code_rotated',
  'homework_attached'
);

alter table workspace_audit_log
  alter column action type workspace_audit_action
  using action::workspace_audit_action;

-- ── 3 · verification ──────────────────────────────────────────────────
do $$
declare
  v_labels text;
  v_expected constant text :=
    'workspace_created,join_code_rotated,student_joined,student_left,'
    'student_removed,staff_joined,staff_activated,staff_removed,'
    'exam_created,exam_published,exam_closed,exam_code_rotated,'
    'exam_access_requested,exam_access_approved,exam_access_rejected,'
    'exam_access_revoked,'
    'homework_created,homework_published,homework_closed,homework_code_rotated,'
    'homework_attached';
  v_type text;
begin
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into v_labels
    from pg_enum e join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'workspace_audit_action';
  if v_labels is distinct from v_expected then
    raise exception E'rollback: the rebuilt type is wrong\n  want: %\n  got : %', v_expected, v_labels;
  end if;

  -- The column must be back ON the type, not left as text — the one way this
  -- rollback could "succeed" while leaving the table unconstrained.
  select format_type(a.atttypid, a.atttypmod) into v_type
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.relname = 'workspace_audit_log' and a.attname = 'action';
  if v_type is distinct from 'workspace_audit_action' then
    raise exception 'rollback: workspace_audit_log.action is % and not workspace_audit_action', v_type;
  end if;
end $$;

commit;
