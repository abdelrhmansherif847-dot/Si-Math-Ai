-- =====================================================================
-- Teacher Homework, increment H1 — five audit labels, and nothing else
-- =====================================================================
-- STATUS: 🟡 PREPARED, not applied. Apply only with explicit owner approval
--         (CLAUDE.md §3). Rollback posture: 20260902z — read its header
--         before relying on it, because it is not a clean undo.
-- DEPENDS ON: 20260901b (the type already carries the eight exam labels;
--             positions 1–16 are what this file asserts it will not move)
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.14 (homework keeps
--          its own model: code → immediate unlock, no approval) and §15.15
--          (the six Homework decisions locked 2026-09-02).
--
-- WHAT THIS IS, AND ALL IT IS
-- ---------------------------
-- Five new values on workspace_audit_action. No table, no column, no RPC, no
-- policy, no grant, no row. Nothing in the codebase writes any of these labels
-- yet and nothing reads them: after this migration the database can NAME five
-- events it still has no way to cause. H2 (tables) and H3/H4 (the RPCs that
-- write them) follow as their own increments.
--
-- It is separate from H2 for the property 20260901b measured on this database
-- (PG 17.6), not a preference:
--
--     alter type ... add value  inside a transaction  -> ALLOWED
--     the new label visible in pg_enum same txn       -> YES
--     casting or inserting it   in the same txn       -> REFUSED
--         ERROR: unsafe use of new value "..." of enum type
--
-- So a migration that adds a label and then uses it cannot work as one unit.
-- The labels must be committed before any RPC can write them.
--
-- ⚠️ THIS MIGRATION IS NOT CLEANLY REVERSIBLE.
-- PostgreSQL has no ALTER TYPE ... DROP VALUE. Undoing it means dropping and
-- recreating the type around a live column — see 20260902z, which is written
-- out honestly rather than pretended. Treat the choice of labels as permanent:
-- a label added speculatively and never used is clutter that cannot be swept
-- up. That is why this adds five and not more. There is no 'homework_deleted'
-- (a draft's deletion is not an event a teacher needs in the trail — exams
-- made the same choice), no 'homework_opened' or 'homework_submitted' (a
-- sitting is a record in its own table, as exam attempts are), and no
-- 'homework_access_*' family at all: §15.14 gives homework no approval queue,
-- so there is no decision to log — only the attachment.
--
-- WHY APPENDED, NOT POSITIONED
-- ----------------------------
-- No BEFORE/AFTER. Enum sort order is observable only to something that
-- orders by the column, and nothing does: the one index on the table is
-- (workspace_id, created_at desc). Appending is also the only form that cannot
-- renumber an existing value; the sixteen labels already present keep sort
-- positions 1..16, and the verification below asserts the whole ordered list.
--
-- THE WRITING CONVENTION THESE LABELS ASSUME
-- ------------------------------------------
-- Recorded here because the labels are added now and first written in H3/H4,
-- and the two must agree. Same rule as the exam labels:
--
--   homework_created / homework_published / homework_closed / homework_code_rotated
--       subject_id NULL, meta carries {'homework_id': ...}
--       — the subject is a paper, and subject_id references auth.users.
--
--   homework_attached
--       subject_id = the STUDENT, meta carries {'homework_id': ...}
--       — a student entering the code is the one event on the access side;
--         there is no request, approval, rejection or revocation to log
--         because there is no queue. A teacher reading one student's history
--         sees the attachment alongside their joins and removals.
-- =====================================================================

begin;

alter type workspace_audit_action add value if not exists 'homework_created';
alter type workspace_audit_action add value if not exists 'homework_published';
alter type workspace_audit_action add value if not exists 'homework_closed';
alter type workspace_audit_action add value if not exists 'homework_code_rotated';
alter type workspace_audit_action add value if not exists 'homework_attached';

-- IF NOT EXISTS is deliberate. This migration cannot be rolled back, so a run
-- that dies after the third statement must be resumable by re-running it.

-- ── verification ──────────────────────────────────────────────────────
-- One exact-string comparison of the whole ordered label list, not a count.
-- A count of 21 would pass with a label misspelled; this will not. It fails on
-- a missing label, a misspelled label, a reordered label and an extra label
-- alike, which is the only assertion here that could actually go red.
--
-- What this CANNOT check, stated so nobody mistakes its silence for proof:
-- that a row can be WRITTEN with one of these labels. The value is unusable
-- until this transaction commits. That test is post-apply, and it is the first
-- thing to run afterwards — in a transaction that aborts, because the log is
-- append-only and a verification row would be permanent.
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
  v_rows text;
begin
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into v_labels
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'workspace_audit_action';

  if v_labels is distinct from v_expected then
    raise exception E'H1: enum labels are not what this migration intends\n  want: %\n  got : %',
      v_expected, v_labels;
  end if;

  -- An enum addition must not touch a stored row. Enum values are stored as
  -- OIDs, so the failure this guards against is a remap, not an edit. Stated
  -- as an invariant over the SIXTEEN labels that have writers today — the
  -- eight workspace labels and the eight exam labels — rather than as today's
  -- row contents, so a student joining or an exam being published between
  -- review and apply cannot abort the migration.
  select string_agg(distinct action::text, ',') into v_rows
    from workspace_audit_log
   where action::text <> all (array[
     'workspace_created', 'join_code_rotated', 'student_joined', 'student_left',
     'student_removed', 'staff_joined', 'staff_activated', 'staff_removed',
     'exam_created', 'exam_published', 'exam_closed', 'exam_code_rotated',
     'exam_access_requested', 'exam_access_approved', 'exam_access_rejected',
     'exam_access_revoked']);
  if v_rows is not null then
    raise exception 'H1: stored audit rows now read as %, which no writer can produce', v_rows;
  end if;
end $$;

commit;
