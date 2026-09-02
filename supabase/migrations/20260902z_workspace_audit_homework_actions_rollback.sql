-- =====================================================================
-- Rollback for 20260902a — and this one is NOT a real undo
-- =====================================================================
-- STATUS: 🔴 PREPARED, deliberately unapplied, and deliberately unpleasant.
--
-- PostgreSQL has no ALTER TYPE ... DROP VALUE. Removing an enum label means
-- destroying the type and building a new one around a live column, which is:
--
--   * a full table rewrite of workspace_audit_log under ACCESS EXCLUSIVE,
--     trivial at today's row count and not trivial after a year of history;
--   * a drop and recreate of a type that other objects may have come to
--     depend on by the time anyone reads this.
--
-- PRECONDITIONS — check all three before running, because the script can
-- check only the first for you:
--
--   1. No row in workspace_audit_log holds one of the five homework labels.
--      The cast in step 4 fails if one does, which is correct: a label that
--      history depends on is not removable, and losing the row would be worse
--      than keeping the label.
--   2. No function signature, default, or generated column references the
--      type. Verified on 2026-09-02 — one column, no default, no index on it,
--      no function taking or returning it — but re-verify.
--   3. ⚠️ H2–H7 HAVE NOT LANDED. Once H3/H4 write these labels, this file
--      stops being a rollback of H1 and becomes a rollback of everything built
--      on it. The window in which this script is meaningful closes the moment
--      the first homework RPC ships.
--
-- If you are here to undo a MISTAKE IN THE LABEL SET rather than to undo H1
-- itself: adding a further label is one cheap ALTER, and a wrong label left
-- unused is inert. Prefer that. This script is for abandoning the increment.
--
-- The sixteen labels recreated below are the type as it stands after
-- 20260901b, in the order PostgreSQL holds them (read 2026-09-02). They are
-- the exam labels too: this file undoes H1 and nothing earlier.
-- =====================================================================

begin;

-- 1 · refuse loudly rather than silently discard history
do $$
declare v_used text;
begin
  select string_agg(distinct action::text, ', ') into v_used
    from workspace_audit_log
   where action::text = any (array[
     'homework_created', 'homework_published', 'homework_closed',
     'homework_code_rotated', 'homework_attached']);
  if v_used is not null then
    raise exception
      'rollback H1 refused: the audit log already records %. Removing these labels '
      'would mean deleting that history — decide that explicitly, not here.', v_used;
  end if;
end $$;

-- 2 · widen the column off the type
alter table workspace_audit_log alter column action type text;

-- 3 · destroy and rebuild the type with exactly the sixteen pre-H1 labels, in order
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
  'exam_access_revoked'
);

-- 4 · narrow the column back. Fails if step 1 was somehow bypassed.
alter table workspace_audit_log
  alter column action type workspace_audit_action
  using action::workspace_audit_action;

-- ── verification ──────────────────────────────────────────────────────
do $$
declare
  v_labels text;
  v_expected constant text :=
    'workspace_created,join_code_rotated,student_joined,student_left,'
    'student_removed,staff_joined,staff_activated,staff_removed,'
    'exam_created,exam_published,exam_closed,exam_code_rotated,'
    'exam_access_requested,exam_access_approved,exam_access_rejected,'
    'exam_access_revoked';
  v_type text;
begin
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into v_labels
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'workspace_audit_action';
  if v_labels is distinct from v_expected then
    raise exception E'rollback H1: labels not restored\n  want: %\n  got : %', v_expected, v_labels;
  end if;

  -- The column must be back ON the type, not left as text. Getting this wrong
  -- would leave the audit log accepting any string at all, which is a worse
  -- state than the one being rolled back.
  select format_type(a.atttypid, a.atttypmod) into v_type
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'workspace_audit_log' and a.attname = 'action';
  if v_type is distinct from 'workspace_audit_action' then
    raise exception 'rollback H1: action column is %, not workspace_audit_action', v_type;
  end if;
end $$;

commit;
