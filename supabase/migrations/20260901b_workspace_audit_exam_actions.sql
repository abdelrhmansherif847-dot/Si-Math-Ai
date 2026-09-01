-- =====================================================================
-- Teacher Exams, increment 3a — eight audit labels, and nothing else
-- =====================================================================
-- STATUS: 🟢 APPLIED 2026-09-01 as version 20260901153803.
--
-- Post-apply verification, including the one test the dry-run structurally
-- could not run: all EIGHT labels were written to workspace_audit_log for real
-- and each read back identical — done per label, because each was added by its
-- own ALTER and proving one writable proves nothing about the other seven. That
-- write test ran in a transaction that aborted (rows 2 -> 10 -> 2), because this
-- table is append-only and has no delete path: a verification row would have
-- been permanent. The original eight labels still hold sort positions 1..8.
--
-- WHAT THIS IS, AND ALL IT IS
-- ---------------------------
-- Eight new values on workspace_audit_action. No table, no column, no RPC,
-- no policy, no grant, no row. Nothing in the codebase writes any of these
-- labels yet, and nothing reads them: after this migration the database can
-- NAME eight events it still has no way to cause.
--
-- It is separate from 3b for a reason that is a property of PostgreSQL, not a
-- preference. Measured on this database (PG 17.6) rather than recalled:
--
--     alter type ... add value  inside a transaction  -> ALLOWED
--     the new label visible in pg_enum same txn       -> YES
--     casting or inserting it   in the same txn       -> REFUSED
--         ERROR: unsafe use of new value "..." of enum type
--
-- So a migration that adds a label and then uses it cannot work as one unit.
-- The labels must be committed before any RPC can write them, which makes the
-- split a hard requirement and 3a the first thing that lands.
--
-- ⚠️ THIS MIGRATION IS NOT CLEANLY REVERSIBLE.
-- PostgreSQL has no ALTER TYPE ... DROP VALUE. Undoing it means dropping and
-- recreating the type around a live column — see 20260901y, which is written
-- out honestly rather than pretended. Treat the choice of labels as permanent:
-- a label added speculatively and never used is clutter that cannot be swept
-- up. That is why this adds eight and not ten. There is no 'exam_deleted' here
-- because 3c has not yet established that a draft exam can be deleted at all;
-- adding a label later is one more ALTER, and removing one is a table rewrite.
--
-- WHY APPENDED, NOT POSITIONED
-- ----------------------------
-- No BEFORE/AFTER. Enum sort order is observable only to something that orders
-- by the column, and nothing does: there is no index on workspace_audit_log
-- .action, no consumer orders by it, and the one index on the table is
-- (workspace_id, created_at desc). Appending is also the only form that cannot
-- renumber an existing value.
--
-- THE WRITING CONVENTION THESE LABELS ASSUME
-- ------------------------------------------
-- Recorded here because the labels are added now and first written in 3c/3d,
-- and the two must agree. subject_id is a user, as it already is for
-- student_joined and staff_removed:
--
--   exam_created / exam_published / exam_closed / exam_code_rotated
--       subject_id NULL, meta carries {'exam_id': ...}
--       — the subject is a paper, and subject_id references auth.users.
--         This is exactly how join_code_rotated already behaves.
--
--   exam_access_requested / _approved / _rejected / _revoked
--       subject_id = the STUDENT, meta carries {'exam_id': ...}
--       — so a teacher reading one student's history sees their access
--         decisions alongside their joins and removals, in one trail.
-- =====================================================================

begin;

alter type workspace_audit_action add value if not exists 'exam_created';
alter type workspace_audit_action add value if not exists 'exam_published';
alter type workspace_audit_action add value if not exists 'exam_closed';
alter type workspace_audit_action add value if not exists 'exam_code_rotated';
alter type workspace_audit_action add value if not exists 'exam_access_requested';
alter type workspace_audit_action add value if not exists 'exam_access_approved';
alter type workspace_audit_action add value if not exists 'exam_access_rejected';
alter type workspace_audit_action add value if not exists 'exam_access_revoked';

-- IF NOT EXISTS is deliberate. This migration cannot be rolled back, so a run
-- that dies after the fourth statement must be resumable by re-running it.

-- ── verification ──────────────────────────────────────────────────────
-- One exact-string comparison of the whole ordered label list, not a count.
-- A count of 16 would pass with a label misspelled; this will not. It fails on
-- a missing label, a misspelled label, a reordered label and an extra label
-- alike, which is the only assertion here that could actually go red.
--
-- What this CANNOT check, stated so nobody mistakes its silence for proof:
-- that a row can be WRITTEN with one of these labels. The probe above shows
-- why — the value is unusable until this transaction commits. That test is
-- post-apply, and it is the first thing to run afterwards.
do $$
declare
  v_labels text;
  v_expected constant text :=
    'workspace_created,join_code_rotated,student_joined,student_left,'
    'student_removed,staff_joined,staff_activated,staff_removed,'
    'exam_created,exam_published,exam_closed,exam_code_rotated,'
    'exam_access_requested,exam_access_approved,exam_access_rejected,'
    'exam_access_revoked';
  v_rows text;
begin
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into v_labels
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'workspace_audit_action';

  if v_labels is distinct from v_expected then
    raise exception E'3a: enum labels are not what this migration intends\n  want: %\n  got : %',
      v_expected, v_labels;
  end if;

  -- An enum addition must not touch a stored row. Enum values are stored as
  -- OIDs, so the failure this guards against is a remap, not an edit.
  --
  -- Stated as an invariant rather than as today's two rows on purpose: the log
  -- is append-only and a student joining between this review and the apply
  -- would legitimately add a row. An assertion that counted, or that pinned the
  -- exact contents, would abort the migration over a student doing something
  -- normal. This cannot, and still goes red on the thing that matters.
  select string_agg(distinct action::text, ',') into v_rows
    from workspace_audit_log
   where action::text <> all (array[
     'workspace_created', 'join_code_rotated', 'student_joined', 'student_left',
     'student_removed', 'staff_joined', 'staff_activated', 'staff_removed']);
  if v_rows is not null then
    raise exception '3a: stored audit rows now read as %, which no writer can produce', v_rows;
  end if;
end $$;

commit;
