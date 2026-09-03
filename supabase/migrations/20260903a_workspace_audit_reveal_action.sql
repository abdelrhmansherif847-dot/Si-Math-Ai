-- =====================================================================
-- Teacher Homework — one audit label: revealing the answers
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-09-03 as version 20260903175543, immediately before
--         20260903b (version 20260903175957). That order is a real dependency,
--         not a filing convention. Rollback: 20260903z, PREPARED and unapplied.
--         Post-apply: 22 labels, this one at position 22, the prior 21 exact,
--         and the label proved WRITABLE by the live RPC in an aborting
--         transaction — the test this file said it could not perform itself.
-- DEPENDS ON: 20260902a (the type already carries the five homework labels;
--             positions 1–21 are what this file asserts it will not move)
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.16a — the audit that
--          found this gap, and §15.15b for the latch itself.
--
-- WHY THIS EXISTS, AND WHY IT IS ITS OWN MIGRATION
-- ------------------------------------------------
-- Revealing a homework's answers is irreversible: 20260902b makes
-- reveal_answers a one-way latch, so the act cannot be undone by anyone. It can
-- be performed by the teacher OR any active assistant — decision 5 gives them
-- identical power — and it changes what every student on that paper can see.
--
-- Measured on production before this file was written: after a reveal the
-- database holds reveal_answers = true and a bumped updated_at, and nothing
-- else. teacher_homework has no updated_by, no revealed_by, no revealed_at; its
-- only actor column is created_by, which names whoever created the paper, not
-- whoever revealed it. updated_at is stamped by EVERY accepted update, so a
-- due-date change and a reveal are indistinguishable by timestamp. The database
-- could say the answers were revealed and could not say by whom.
--
-- Three of the four other consequential acts on a homework — created,
-- published, closed, code_rotated — are already logged. The omission was an
-- accident of which labels 20260902a happened to ship, not a decision that a
-- reveal does not matter.
--
-- It is separate from 20260903b for the property 20260901b measured on this
-- database (PG 17.6), not a preference:
--
--     alter type ... add value  inside a transaction  -> ALLOWED
--     the new label visible in pg_enum same txn       -> YES
--     casting or inserting it   in the same txn       -> REFUSED
--         ERROR: unsafe use of new value "..." of enum type
--
-- So the RPC that writes this label cannot be created in the same transaction
-- that adds it. The label must be committed first. Hiding it inside the
-- authoring migration would not work even if it were desirable.
--
-- ⚠️ THIS MIGRATION IS NOT CLEANLY REVERSIBLE.
-- PostgreSQL has no ALTER TYPE ... DROP VALUE. Undoing it means dropping and
-- recreating the type around a live column — see 20260903z, written out
-- honestly rather than pretended. Treat the label as permanent.
--
-- WHY EXACTLY ONE LABEL
-- ---------------------
-- No 'homework_answers_hidden': the latch is one-way, so there is no such
-- event to log. No 'homework_deleted', for a reason measured rather than
-- assumed (§15.16a): a delete can only ever destroy a draft with no
-- attachment, no attempt and no answer, so the label would record the disposal
-- of something that contained nothing. No 'homework_updated' or
-- 'homework_due_changed': both are reversible, repeatable and visible in the
-- row itself, which is the test the exam labels already applied.
--
-- THE WRITING CONVENTION, MATCHING 20260902a EXACTLY
-- --------------------------------------------------
--   homework_answers_revealed
--       actor_id   = the staff member who threw the latch (auth.uid())
--       subject_id = NULL — subject_id references auth.users and the subject
--                    here is a paper, not a person. Same rule as
--                    homework_created / _published / _closed / _code_rotated;
--                    homework_attached is the one label with a student subject.
--       meta       = {'homework_id': ...}
--       created_at = the log's own default, which is when it happened.
--
--   Written EXACTLY ONCE per reveal that actually changed something. A second
--   call on an already-revealed paper is idempotent and logs nothing, because
--   nothing happened; a refused call logs nothing because it raises. Both are
--   asserted in 20260903b's dry-run.
-- =====================================================================

begin;

alter type workspace_audit_action add value if not exists 'homework_answers_revealed';

-- IF NOT EXISTS is deliberate. This migration cannot be rolled back cleanly, so
-- a run that dies must be resumable by re-running it.

-- ── verification ──────────────────────────────────────────────────────
-- One exact-string comparison of the whole ordered label list, not a count: a
-- count of 22 would pass with the label misspelled, and this will not. It fails
-- on a missing, misspelled, reordered or extra label alike.
--
-- What this CANNOT check, stated so its silence is not mistaken for proof: that
-- a row can be WRITTEN with this label. The value is unusable until this
-- transaction commits. That test is post-apply, in a transaction that aborts,
-- because the log is append-only and a verification row would be permanent.
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
    'homework_attached,'
    'homework_answers_revealed';
  v_rows text;
begin
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into v_labels
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'workspace_audit_action';

  if v_labels is distinct from v_expected then
    raise exception E'reveal label: enum labels are not what this migration intends\n  want: %\n  got : %',
      v_expected, v_labels;
  end if;

  -- An enum addition must not touch a stored row. Enum values are stored as
  -- OIDs, so the failure this guards against is a remap, not an edit. Stated as
  -- an invariant over the SIXTEEN labels that have writers today: the eight
  -- workspace labels and the eight exam labels. The five homework labels from
  -- 20260902a still have none, because the RPCs that write them are 20260903b
  -- and H4, neither applied.
  select string_agg(distinct action::text, ',') into v_rows
    from workspace_audit_log
   where action::text <> all (array[
     'workspace_created', 'join_code_rotated', 'student_joined', 'student_left',
     'student_removed', 'staff_joined', 'staff_activated', 'staff_removed',
     'exam_created', 'exam_published', 'exam_closed', 'exam_code_rotated',
     'exam_access_requested', 'exam_access_approved', 'exam_access_rejected',
     'exam_access_revoked']);
  if v_rows is not null then
    raise exception 'reveal label: stored audit rows now read as %, which no writer can produce', v_rows;
  end if;
end $$;

commit;
