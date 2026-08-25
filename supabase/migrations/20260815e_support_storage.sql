-- =====================================================================
-- Help & Support · 5 of 6 — screenshot attachment storage
-- =====================================================================
-- STATUS: ✅ APPLIED to production as version 20260816154037 (name: support_storage).
--         Corrected 2026-08-25: this file said "NOT YET APPLIED —
--         awaiting owner approval" while the support system was live
--         in production. The 20260815 filename prefix is the drafting
--         date; the version above is the apply.
--         Revision 2, reconciled against APPROVED 20260815a rev 4,
--         20260815b rev 4, 20260815c rev 3 and 20260815d rev 4.
-- DEPENDS ON: 20260815a — support_attachments, whose storage_path points here
--             20260815b — has_role_at_least() as the admin predicate, and
--                         support_student_can_post(), which this file now calls
--                         so the object obeys the same lifecycle as the row
--
-- WHY THIS EXISTS
-- ---------------
-- "Attach a screenshot" is most of what makes a support ticket answerable. The
-- platform already has the infrastructure — manual-payment.html uploads payment
-- proofs to a private bucket and stores a reference — so this is that pattern
-- applied to a second bucket, not a new capability.
--
-- WHY A SEPARATE BUCKET AND NOT A FOLDER IN payment-proofs
-- --------------------------------------------------------
-- Payment proofs are financial records with a different retention question and
-- a different audience. Mixing support screenshots into them would mean one
-- policy change affects both, and a bucket-wide mistake would expose both. The
-- separation is the same argument the schema makes: support data lives on its
-- own.
--
-- =====================================================================
-- WHAT REVISION 1 GOT WRONG — THE OBJECT WAS NOT BOUND TO A TICKET
-- =====================================================================
-- Revision 1's upload policy was, in full:
--
--     bucket_id = 'support-attachments'
--     and (storage.foldername(name))[1] = auth.uid()::text
--
-- and its header said, of the ticket id in the path, "The ticket id is there
-- for humans reading the bucket, not for authorisation." That was the whole
-- mistake, and it is larger than the closed-ticket case it was first raised as.
--
-- storage.foldername('uid/anything.png') is {uid}, so that path SATISFIES the
-- policy. No ticket id is required in it at all — not a closed ticket's, not
-- any ticket's, not a real one. Every authenticated student could upload
-- unlimited objects into their own folder indefinitely, bounded only by the
-- 5 MB size cap and the three permitted MIME types. That is not a lifecycle
-- leak producing orphan rows; it is an open image host attached to the product.
--
-- The reasoning that produced it was that the attachment ROW is the real gate,
-- and 20260815b does gate the row properly — a student cannot register an
-- attachment against a closed ticket. But a row and an object are two
-- resources. Gating one says nothing about the other, and the ungated one is
-- the one that consumes storage.
--
-- REVISION 2 BINDS THE OBJECT TO A TICKET, using the same predicate the row
-- uses. An upload must name, in the second path segment, a ticket that
-- support_student_can_post() accepts: owned by the caller, not closed, and
-- inside the reopen window if one is ever configured. One definition of "may
-- this student add support content right now", honoured by the row policy in
-- 20260815b and by the object policy here.
--
-- PATH CONVENTION — now load-bearing, not documentation
-- -----------------------------------------------------
--     ${user_id}/${ticket_id}/${timestamp}.${ext}
--
--   segment 1  the owner's id       — a student cannot write into another
--                                     student's folder
--   segment 2  the ticket id        — must parse as a uuid AND pass the
--                                     lifecycle check. Forging it no longer
--                                     buys a write; it buys a refusal.
--
-- READS ARE DELIBERATELY NOT LIFECYCLE-BOUND. A student must still be able to
-- open the screenshot they attached to a ticket that has since closed —
-- history is meant to remain readable. Writing new content into a settled
-- conversation is the thing being prevented, not looking at it.
--
-- WHAT THIS STILL DOES NOT BOUND, stated rather than left to be discovered:
-- a student with one live ticket can upload many objects into that ticket's
-- folder. The lifecycle gate bounds WHEN and WHERE, not HOW MANY. Closing that
-- would need a per-ticket or per-message object budget, which is a product
-- decision and a new setting, so it is not smuggled in here. It is a far
-- smaller surface than revision 1's, which required no ticket whatsoever.
-- =====================================================================

-- ── 1. The bucket ──────────────────────────────────────────────────────────
-- public = false: every read goes through a signed URL or a policy check.
-- The size and MIME limits duplicate support_attachments' CHECK constraints on
-- purpose — one guards the object, the other guards the row, and neither
-- implies the other. Revision 1's mistake was assuming that one guarding
-- implies the other being guarded.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,                                              -- 5 MB, matches support_attachments_size_chk
  array['image/png', 'image/jpeg', 'image/webp']        -- matches support_attachments_mime_chk
)
on conflict (id) do nothing;

-- ── 2. The upload predicate ────────────────────────────────────────────────
-- Written as a function rather than inline in the policy for one concrete
-- reason: the ticket id arrives as TEXT out of a path, and 'not-a-uuid'::uuid
-- RAISES invalid_text_representation rather than returning false. An exception
-- thrown from inside a policy is an error the caller sees, not a denial — and a
-- malformed path should be refused, not crash the request. plpgsql can catch
-- that; a policy expression cannot.
--
-- SECURITY INVOKER, deliberately, following the rule established in 20260815a:
-- a function that needs no privilege must not carry one. It reads no table
-- itself. storage.foldername() is executable by authenticated under this
-- project's default ACL for the storage schema, and support_student_can_post()
-- is explicitly granted to authenticated in 20260815b — and is itself SECURITY
-- DEFINER, so it elevates on its own behalf to read support_tickets.

create or replace function public.support_attachment_upload_allowed(p_name text)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_parts  text[] := storage.foldername(p_name);
  v_ticket uuid;
begin
  -- Both segments are required. 'uid/file.png' yields {uid}, which is exactly
  -- the shape revision 1 accepted and this rejects.
  if v_parts is null or coalesce(array_length(v_parts, 1), 0) < 2 then
    return false;
  end if;

  if v_parts[1] is distinct from auth.uid()::text then
    return false;
  end if;

  begin
    v_ticket := v_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  -- The same question the row policy asks, asked once, in one place.
  return public.support_student_can_post(v_ticket);
end;
$$;

comment on function public.support_attachment_upload_allowed(text) is
  'True when an object path is ${own uid}/${a ticket the caller may currently post on}/… . SECURITY INVOKER — reads no table; support_student_can_post() elevates itself. Returns false for a malformed path rather than raising.';

revoke all on function public.support_attachment_upload_allowed(text) from public, anon;
grant  execute on function public.support_attachment_upload_allowed(text) to authenticated;

-- ── 3. Upload ──────────────────────────────────────────────────────────────
-- Two independent gates remain, and that is still the intent — but now they
-- guard two different resources with the SAME lifecycle rule, instead of one
-- guarding a row while the other guarded nothing:
--   this policy               → the OBJECT, bound to a live own ticket
--   support_attachments_*     → the ROW, bound to a message on a live own ticket

create policy "support attachments: upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and public.support_attachment_upload_allowed(name)
  );

-- ── 4. Read ────────────────────────────────────────────────────────────────
-- The owner, or an agent. NOT lifecycle-bound, on purpose: a closed ticket's
-- screenshots must stay viewable, or the record of what was discussed
-- evaporates the moment the ticket settles. has_role_at_least('admin') is the
-- same predicate every support table uses, rather than the legacy
-- profiles.is_admin form the payment-proofs policy still carries.

create policy "support attachments: read own or agent"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or has_role_at_least('admin')
    )
  );

-- ── 5. Delete ──────────────────────────────────────────────────────────────
-- Agents only. A student deleting the screenshot mid-conversation removes the
-- evidence the agent is working from, and the attachment row would survive as
-- a dangling reference. Retention and takedown are staff decisions.

create policy "support attachments: delete by agent"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'support-attachments'
    and has_role_at_least('admin')
  );

-- No UPDATE policy: an object here is written once. Replacing a screenshot
-- means uploading a new one and posting it, which leaves the conversation
-- honest about what was shown and when.

-- ── VERIFICATION (run after apply) ─────────────────────────────────────────
--   select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'support-attachments';
--   -- expect: public = false, 5242880, the three image types
--
--   select policyname, cmd from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname like 'support attachments%';
--   -- expect: 3 policies (INSERT, SELECT, DELETE) — no UPDATE
--
--   -- ── THE HOLE REVISION 2 CLOSES. Each of these SUCCEEDED under revision 1.
--   -- As a student, upload to a path with NO ticket segment:
--   --   '<own uid>/anything.png'
--   -- expect: new row violates row-level security policy
--   --         (revision 1 accepted this, which made the bucket an open image
--   --          host for any logged-in student)
--
--   -- a ticket segment that is not a uuid — must be REFUSED, not an error:
--   --   '<own uid>/not-a-uuid/x.png'
--   -- expect: RLS violation, NOT "invalid input syntax for type uuid"
--
--   -- a real ticket belonging to someone else:
--   --   '<own uid>/<other student's ticket>/x.png'
--   -- expect: RLS violation
--
--   -- a CLOSED own ticket:
--   select admin_support_set_status('<own ticket>', 'closed');   -- as an agent
--   --   '<own uid>/<that ticket>/x.png'
--   -- expect: RLS violation
--
--   -- the same path while the ticket is live:
--   -- expect: SUCCEEDS. If this fails the fix has over-corrected and students
--   --         cannot attach screenshots at all.
--
--   -- another student's folder, unchanged from revision 1:
--   --   '<other uid>/<their ticket>/x.png'
--   -- expect: RLS violation
--
--   -- ── READS ARE NOT LIFECYCLE-BOUND, by design:
--   -- with the ticket closed, the student must still be able to read the
--   -- object they attached while it was open.
--   -- expect: SUCCEEDS. A failure here means history became unreadable.
--
--   -- ── the predicate's privileges:
--   select has_function_privilege('anon', 'public.support_attachment_upload_allowed(text)', 'execute') as anon,
--          has_function_privilege('authenticated', 'public.support_attachment_upload_allowed(text)', 'execute') as authed;
--   -- expect: anon = false, authed = TRUE. The grant is load-bearing: a
--   -- storage policy is evaluated with the caller's privileges, so without it
--   -- every student upload fails with 42501 instead of working.
