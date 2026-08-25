-- =====================================================================
-- Help & Support · ROLLBACK — undoes 20260815a … 20260815f
-- =====================================================================
-- STATUS: ⚠️ NOT APPLIED, AND THE SIX FORWARD MIGRATIONS ARE NOW LIVE.
--         Corrected 2026-08-25. This file is correctly unapplied, but its
--         header previously read as though the whole chain were still
--         awaiting approval. The forwards shipped as versions 20260816150725
--         through 20260816155449, so running this now DESTROYS a live support
--         system and its data — it is no longer a cheap undo of something
--         that never ran.
--         Revision 3. Written against the APPROVED chain:
--           20260815a rev 4 · 20260815b rev 4 · 20260815c rev 3
--           20260815d rev 5 · 20260815e rev 2 · 20260815f rev 2
--
-- This file exists because every one of those six headers promises it and
-- none of them shipped it. A rollback that has to be composed at the moment
-- something has gone wrong is not a rollback.
--
-- =====================================================================
-- ATOMICITY — ESTABLISHED BY THESE BYTES, NOT ASSUMED OF THE RUNNER
-- =====================================================================
-- Revision 1 claimed in three places that "the whole transaction rolls back"
-- while containing no transaction boundary of its own. That claim rested on an
-- assumption about the migration runner, and an assumption is not a property of
-- a file that issues 6 DROP TABLEs and 3 DELETEs.
--
-- THE EXECUTION CONTRACT, verified against this repository's own applied
-- history rather than against documentation:
--
--   20260802h_daily_limit_is_a_cap_not_an_allowance.sql
--       begin; at line 121, commit; at line 470
--       STATUS: ✅ APPLIED to igvkyxkmjnkzscqgommj on 2026-08-02
--       recorded as supabase_migrations.schema_migrations 20260802192644
--
--   20260802f_refund_ai_credit_server_only.sql
--       begin; at line 124, commit; at line 227
--       STATUS: ✅ APPLIED 2026-08-02
--       recorded as 20260802174206
--
-- Explicit transaction control inside a migration is therefore permitted by the
-- exact mechanism this project uses, and has committed successfully twice on
-- this database. Both of those migrations rewrote entitlement logic, so the
-- precedent is not incidental.
--
-- This file accordingly opens with `begin;` as its FIRST executable statement
-- and closes with `commit;` as its LAST, with nothing after it. That placement
-- matters for the one case the precedent does not settle: if the runner also
-- opens a transaction of its own, an inner BEGIN is a no-op with a warning and
-- the COMMIT ends the outer one — and because no statement follows the commit,
-- there is nothing left that could run outside a transaction either way. The
-- file is atomic under both readings of the runner.
--
-- =====================================================================
-- PRECONDITION — AN EXACT STRUCTURAL CENSUS, NOT A FINGERPRINT
-- =====================================================================
-- Revision 1 treated the mere existence of a type called
-- public.support_ticket_status as proof that 20260815a had been applied.
-- Revision 2 replaced that with two structural checks — the enum's exact label
-- set, and the boolean meeting_granted column that pins revision 4 of
-- 20260815a specifically. Those two identify MIGRATION A. They say nothing
-- about the other 42 objects this file then drops.
--
-- That gap is the defect revision 3 closes. `if exists` makes an ABSENT object
-- harmless, and the explicit transaction makes a FAILED drop harmless, but
-- neither is a substitute for knowing, before the first destructive statement,
-- that the installation about to be dismantled is the one this file was written
-- for. Atomicity is a recovery property. A preflight is a refusal property, and
-- a destructive rollback needs both.
--
-- SECTION 0 NOW VERIFIES ALL 62 OBJECTS OF THE APPROVED CHAIN BY EXACT NAME
-- AND EXACT IDENTITY SIGNATURE:
--
--   20260815a   20 objects   4 enum types (by exact ordered label set)
--                            6 tables     (relkind 'r', RLS enabled)
--                            4 trigger functions
--                            6 triggers   (by table.trigger name)
--   20260815b   18 objects   3 predicate functions
--                            15 row-level policies (by table.policy name)
--   20260815c    2 objects   1 function, 1 trigger
--   20260815d   13 objects   13 RPC functions
--   20260815e    5 objects   1 function, 3 storage policies, 1 bucket
--   20260815f    4 objects   4 system_settings keys
--                            ─────────────────────────────────────────
--                            62 objects total
--
-- NO `LIKE 'support%'` ANYWHERE IN THE PREFLIGHT. Every check names the object
-- it expects. Functions are resolved through to_regprocedure() on a fully
-- schema-qualified identity signature, so admin_support_reply(uuid, text,
-- public.support_ticket_status) is a different object from a same-named
-- function taking different arguments, and only the first satisfies the check.
--
-- RECOGNISED STATES, AND ONLY THESE
-- ---------------------------------
-- The chain is applied one file at a time, so the legitimate states are the six
-- dependency prefixes:
--
--     A · A+B · A+B+C · A+B+C+D · A+B+C+D+E · A–F
--
-- For each migration the preflight computes how many of its expected objects
-- are present and classifies it as:
--
--     found = expected  → FULL
--     found = 0         → ABSENT
--     anything between  → REFUSE. A migration that is half-present is drift by
--                         definition: either it failed part-way, or something
--                         outside the chain has removed or replaced one of its
--                         objects. Neither is a state this file may act on.
--
-- Then the FULL set must be a contiguous prefix beginning at A. A gap — say B
-- absent while C is present — is refused even though every individual object
-- checked out, because it is not a state the chain can produce.
--
-- HOW THAT DISTINGUISHES A PARTIAL CHAIN FROM A DRIFTED SCHEMA
-- ------------------------------------------------------------
-- A partial chain is missing WHOLE migrations from the END. A drifted schema is
-- missing, extra, or altered objects ANYWHERE. The two are separated by the
-- all-or-nothing classification above, which is why the counts are per
-- migration rather than one total: a single total of 62 could not tell "E and F
-- not applied yet" (54, legitimate) from "eight objects dropped by hand" (54,
-- drift). Per-migration counts distinguish them; one total cannot.
--
-- AND ONE MORE THING NO COUNT CAN SEE — DEPENDENCIES ADDED LATER
-- ---------------------------------------------------------------
-- The concrete risk is not that an expected object is missing. It is that a
-- LATER migration added something that depends on one of them: a view over
-- support_tickets, a foreign key into it, a column typed support_category, a
-- policy on another table calling support_student_can_post(). Every count above
-- would still be 62 and the file would start dropping.
--
-- So the preflight also walks pg_depend from the OIDs of the expected objects
-- and refuses if ANY dependent is not itself part of the chain. It is an
-- OID-based scan, not a name scan: the expected objects are resolved to OIDs
-- first, and the chain's own constraints, indexes, triggers, policies, defaults
-- and rewrite rules are excluded by catalogue lookup rather than by name.
--
-- WHAT THAT SCAN CANNOT SEE, stated rather than left to be discovered: PL/pgSQL
-- function bodies are not parsed at creation time, so a function that reads
-- support_tickets inside its body records no dependency. That blindness is not
-- specific to this scan — Postgres itself would let the DROP succeed and leave
-- that function broken at its next call. The preflight is therefore exactly as
-- strong as the DROP behaviour it precedes; what it adds is that the refusal
-- happens BEFORE anything is destroyed rather than part-way through. Code
-- review remains the only thing that catches the PL/pgSQL case, in this file
-- and in Postgres generally.
--
-- WHAT IS DELIBERATELY *NOT* IN THE FINGERPRINT, and why
-- ------------------------------------------------------
--   * The 6 seeded help-centre ARTICLES. 20260815f's own header declares them
--     editable from the admin page and pinned by no CI check. An agent
--     rewriting or deleting one is normal operation, not drift, so requiring
--     them would produce false refusals. The four system_settings KEYS are used
--     for F instead: nothing in the product deletes a settings key.
--   * The 13 INDEXES from 20260815a. An index carries no behaviour and falls
--     with its table; an extra one added for performance is not drift, and a
--     missing one does not make a DROP unsafe.
--   * FUNCTION BODIES. A rewritten body is invisible to a signature check — but
--     this file's purpose is to delete the function, so its body is moot. What
--     matters is who DEPENDS on it, which the pg_depend scan covers to the
--     limit described above.
--
-- =====================================================================
-- WHAT THIS DESTROYS, STATED PLAINLY
-- =====================================================================
-- Rolling back a support system removes support data. That is what it is for,
-- and it is not an accident to be discovered afterwards:
--
--   * every support ticket, message and attachment row
--   * every meeting and meeting slot
--   * every help-centre article, including any an agent wrote after launch
--   * the four support.* rows in system_settings
--
-- Section 0 prints those counts as NOTICEs BEFORE anything is dropped, so the
-- transaction log carries a record of exactly what was removed. Read them.
--
-- WHAT IT CANNOT TOUCH
-- --------------------
-- Nothing outside the support surface. There is no statement in this file
-- naming question_records, mastery_records, weakness_signals, chat_sessions,
-- focus_plans, focus_tasks, study_plans, session_questions, profiles,
-- subscriptions, plan_definitions or auth.users. The only PRE-EXISTING objects
-- it writes to at all are:
--
--   system_settings   — DELETE of exactly four rows, matched by exact key.
--                       No pattern, no LIKE, no wildcard: a key that is not one
--                       of those four literals cannot be caught by it.
--   storage.objects   — DELETE restricted to bucket_id = 'support-attachments'.
--   storage.buckets   — DELETE of that one bucket id.
--
-- STORAGE CAVEAT, because it would otherwise be a surprise: deleting rows from
-- storage.objects removes the DATABASE's record of the files. Whether the
-- underlying bytes are reclaimed from the storage backend is the storage
-- service's business, not this transaction's. If the objects must genuinely be
-- purged, do it through the storage API BEFORE running this, while the rows
-- still name them.
--
-- =====================================================================
-- ORDER, AND WHY IT IS SAFE
-- =====================================================================
-- Strict reverse dependency order, F → A, because Postgres refuses a DROP
-- whose dependents still exist and this file never uses CASCADE. CASCADE would
-- make the order irrelevant and the blast radius unknowable; naming every
-- object explicitly means the file cannot remove something nobody listed.
--
--   1. storage POLICIES        depend on support_attachment_upload_allowed()
--                              and has_role_at_least()
--   2. storage OBJECTS, BUCKET objects reference the bucket by FK
--   3. TABLES                  each drop takes its own indexes, triggers, RLS
--                              policies and FK constraints with it, which is
--                              why none of those is listed separately.
--                              Ordered support_meetings → attachments →
--                              messages → slots → tickets → articles, i.e.
--                              children before parents
--   4. FUNCTIONS               after the tables, because a policy or trigger
--                              referencing a function is a dependency that
--                              blocks the function's DROP; once the tables are
--                              gone, nothing refers to them
--   5. TYPES                   last: functions carry them in their signatures
--                              (admin_support_reply, admin_support_set_status)
--                              and tables carry them in their columns
--   6. system_settings ROWS    order-independent; last so the settings survive
--                              a failure at any earlier step and the whole
--                              transaction — now an explicit one — takes them
--                              back with it
--
-- Steps 4 and 5 in that sequence are the one people get wrong: dropping the
-- enum before the function whose signature names it fails, and dropping the
-- function before the policy that calls it fails too.
--
-- A NOTE ON PRE-APPROVAL DRAFTS. This file rolls back the APPROVED chain, so
-- it does not mention support_escalation_state or the slots' claimed_by /
-- claimed_at columns — revision 4 of 20260815a removed all three before
-- anything was ever applied, and nothing has been applied at any point. A draft
-- carrying those would now fail gate 2 rather than be partially dismantled by a
-- file written for a schema it does not have.
-- =====================================================================

begin;

-- ── 0. PREFLIGHT ───────────────────────────────────────────────────────────
-- Inside the transaction and above every destructive statement, so a refusal
-- here leaves the schema exactly as it was found.
--
-- Five gates, in this order, and the order is load-bearing:
--
--   1  the enum is ours          (exact ordered label set)
--   2  it is revision 4 of A     (boolean meeting_granted)
--   3  the exact object census   (62 objects, per migration)
--   4  the state is a recognised prefix
--   5  nothing outside the chain depends on what is about to be dropped
--
-- Gates 1 and 2 must precede gate 3 because gate 3 resolves function signatures
-- naming public.support_ticket_status through to_regprocedure(), which parses
-- its argument types: if that type did not exist, the parse would raise an
-- unhelpful error instead of the explicit refusal gate 1 produces.

do $$
declare
  -- ═══════════════════════════════════════════════════════════════════════
  -- THE APPROVED INVENTORY — transcribed from the six approved files.
  -- Exact names. Exact identity signatures. No prefix or pattern matching.
  -- ═══════════════════════════════════════════════════════════════════════

  -- 20260815a rev 4 · 4 types + 6 tables + 4 functions + 6 triggers = 20
  k_a_types     text[] := array[
    'support_category', 'support_ticket_status',
    'support_sender_role', 'support_meeting_status'];
  k_a_tables    text[] := array[
    'public.support_articles', 'public.support_tickets',
    'public.support_messages', 'public.support_attachments',
    'public.support_meeting_slots', 'public.support_meetings'];
  k_a_funcs     text[] := array[
    'public.support_set_updated_at()',
    'public.support_tickets_guard()',
    'public.support_meetings_guard()',
    'public.support_meetings_consume_grant()'];
  k_a_triggers  text[] := array[
    'public.support_articles.support_articles_set_updated_at',
    'public.support_tickets.support_tickets_guard_transitions',
    'public.support_tickets.support_tickets_set_updated_at',
    'public.support_meetings.support_meetings_guard_row',
    'public.support_meetings.support_meetings_set_updated_at',
    'public.support_meetings.support_meetings_consume_grant'];

  -- 20260815b rev 4 · 3 functions + 15 policies = 18
  k_b_funcs     text[] := array[
    'public.support_setting_int(text)',
    'public.support_student_can_post(uuid)',
    'public.support_slot_is_open(uuid)'];
  k_b_policies  text[] := array[
    'public.support_articles.support_articles_read_published',
    'public.support_articles.support_articles_admin_all',
    'public.support_tickets.support_tickets_read_own',
    'public.support_tickets.support_tickets_insert_own',
    'public.support_tickets.support_tickets_admin_all',
    'public.support_messages.support_messages_read_own',
    'public.support_messages.support_messages_insert_own',
    'public.support_messages.support_messages_admin_all',
    'public.support_attachments.support_attachments_read_own',
    'public.support_attachments.support_attachments_insert_own',
    'public.support_attachments.support_attachments_admin_all',
    'public.support_meeting_slots.support_slots_read_bookable',
    'public.support_meeting_slots.support_slots_admin_all',
    'public.support_meetings.support_meetings_read_own',
    'public.support_meetings.support_meetings_admin_all'];

  -- 20260815c rev 3 · 1 function + 1 trigger = 2
  k_c_funcs     text[] := array['public.support_touch_ticket()'];
  k_c_triggers  text[] := array[
    'public.support_messages.support_messages_touch_ticket'];

  -- 20260815d rev 5 · 13 functions
  k_d_funcs     text[] := array[
    'public.support_require_agent()',
    'public.support_assert_meeting_capacity(uuid)',
    'public.support_book_meeting(uuid, uuid)',
    'public.support_cancel_meeting(uuid)',
    'public.admin_support_reply(uuid, text, public.support_ticket_status)',
    'public.admin_support_set_status(uuid, public.support_ticket_status)',
    'public.admin_support_assign(uuid, uuid)',
    'public.admin_support_grant_meeting(uuid)',
    'public.admin_support_revoke_meeting(uuid)',
    'public.admin_support_schedule_for_student(uuid, uuid)',
    'public.admin_support_upsert_slot(jsonb)',
    'public.admin_support_cancel_slot(uuid)',
    'public.admin_support_upsert_article(jsonb)'];

  -- 20260815e rev 2 · 1 function + 3 storage policies + 1 bucket = 5
  k_e_funcs     text[] := array[
    'public.support_attachment_upload_allowed(text)'];
  k_e_policies  text[] := array[
    'support attachments: upload own',
    'support attachments: read own or agent',
    'support attachments: delete by agent'];

  -- 20260815f rev 2 · 4 settings keys. The 6 seeded ARTICLES are deliberately
  -- not part of this fingerprint — see the header.
  k_f_settings  text[] := array[
    'support.reopen_window_days',
    'support.auto_close_after_resolved_days',
    'support.max_active_meetings_per_student',
    'support.meeting_provider'];

  -- ═══ census working state ═══
  v_mig     text[] := array['20260815a','20260815b','20260815c',
                            '20260815d','20260815e','20260815f'];
  v_expect  int[]  := array[20, 18, 2, 13, 5, 4];
  v_found   int[]  := array[0, 0, 0, 0, 0, 0];
  v_state   text[] := array['', '', '', '', '', ''];
  v_prefix  int    := 0;
  i         int;

  v_labels    text[];
  v_tab_oids  oid[];
  v_typ_oids  oid[];
  v_fn_oids   oid[];
  v_foreign   text;

  n1 int; n2 int; n3 int; n4 int;

  n_tickets  bigint := 0;
  n_messages bigint := 0;
  n_attach   bigint := 0;
  n_meetings bigint := 0;
  n_slots    bigint := 0;
  n_articles bigint := 0;
  n_objects  bigint := 0;
  n_settings bigint := 0;
begin
  -- ═══ GATE 1 — the enum is this feature's, identified by its exact label set
  -- rather than by its name.
  select array_agg(e.enumlabel::text order by e.enumsortorder)
    into v_labels
  from pg_type t
  join pg_namespace ns on ns.oid = t.typnamespace
  join pg_enum e       on e.enumtypid = t.oid
  where ns.nspname = 'public' and t.typname = 'support_ticket_status'
    and t.typtype = 'e';

  if v_labels is null then
    raise exception
      'support rollback: nothing to roll back — no enum public.support_ticket_status exists, so 20260815a was never applied here';
  end if;

  if v_labels <> array['open','in_progress','awaiting_student','resolved','closed'] then
    raise exception
      'support rollback: REFUSING — public.support_ticket_status exists but its labels are %, not the approved set. This is not the Help & Support installation this file was written for, and it will not drop objects that merely share a name.',
      v_labels;
  end if;

  -- ═══ GATE 2 — this is REVISION 4 of 20260815a. Revisions 1-3 carried an
  -- escalation_state enum on the ticket; revision 4 replaced it with this
  -- boolean. A pre-approval draft fails here instead of being half-dismantled.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'support_tickets'
      and column_name = 'meeting_granted' and data_type = 'boolean'
  ) then
    raise exception
      'support rollback: REFUSING — public.support_tickets has no boolean meeting_granted column. The installed schema is not revision 4 of 20260815a, and this file must not be used to dismantle a different one.';
  end if;

  -- ═══ GATE 3 — the exact object census, per migration.

  -- 20260815a: types, by exact ordered label set. A same-named type with a
  -- label added or reordered does not count, and is therefore drift.
  select count(*) into n1
  from (values
    ('support_category',       array['account','technical','mock_exam','billing','platform_help','other']),
    ('support_ticket_status',  array['open','in_progress','awaiting_student','resolved','closed']),
    ('support_sender_role',    array['student','agent','system']),
    ('support_meeting_status', array['scheduled','completed','cancelled','no_show'])
  ) as want(tname, labels)
  where exists (
    select 1
    from pg_type t
    join pg_namespace ns on ns.oid = t.typnamespace
    where ns.nspname = 'public'
      and t.typname  = want.tname
      and t.typtype  = 'e'
      and (select array_agg(e.enumlabel::text order by e.enumsortorder)
             from pg_enum e where e.enumtypid = t.oid) = want.labels
  );

  -- tables: ordinary relations with RLS ENABLED. 20260815a enables it on all
  -- six; a table with RLS switched off is not the approved surface, and on a
  -- table holding student support conversations that difference matters enough
  -- to stop for.
  select count(*) into n2
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and ('public.' || c.relname) = any(k_a_tables);

  select count(*) into n3 from unnest(k_a_funcs) sig
   where to_regprocedure(sig) is not null;

  select count(*) into n4
  from pg_trigger tg
  join pg_class c      on c.oid  = tg.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where not tg.tgisinternal
    and (ns.nspname || '.' || c.relname || '.' || tg.tgname) = any(k_a_triggers);

  v_found[1] := n1 + n2 + n3 + n4;

  -- 20260815b
  select count(*) into n1 from unnest(k_b_funcs) sig
   where to_regprocedure(sig) is not null;
  select count(*) into n2 from pg_policies
   where (schemaname || '.' || tablename || '.' || policyname) = any(k_b_policies);
  v_found[2] := n1 + n2;

  -- 20260815c
  select count(*) into n1 from unnest(k_c_funcs) sig
   where to_regprocedure(sig) is not null;
  select count(*) into n2
  from pg_trigger tg
  join pg_class c      on c.oid  = tg.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where not tg.tgisinternal
    and (ns.nspname || '.' || c.relname || '.' || tg.tgname) = any(k_c_triggers);
  v_found[3] := n1 + n2;

  -- 20260815d
  select count(*) into n1 from unnest(k_d_funcs) sig
   where to_regprocedure(sig) is not null;
  v_found[4] := n1;

  -- 20260815e
  select count(*) into n1 from unnest(k_e_funcs) sig
   where to_regprocedure(sig) is not null;
  select count(*) into n2 from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = any(k_e_policies);
  select count(*) into n3 from storage.buckets where id = 'support-attachments';
  v_found[5] := n1 + n2 + n3;

  -- 20260815f
  select count(*) into n1 from public.system_settings where key = any(k_f_settings);
  v_found[6] := n1;

  -- classify: FULL, ABSENT, or refuse
  for i in 1..6 loop
    if v_found[i] = v_expect[i] then
      v_state[i] := 'full';
    elsif v_found[i] = 0 then
      v_state[i] := 'absent';
    else
      raise exception
        'support rollback: REFUSING — % is PARTIALLY present: % of its % expected objects found. A half-present migration is drift, not a state this chain produces, and this file will not dismantle a schema it cannot recognise. Run the census query in the VERIFICATION section to see which objects are missing.',
        v_mig[i], v_found[i], v_expect[i];
    end if;
  end loop;

  -- ═══ GATE 4 — the FULL set must be a contiguous prefix beginning at A.
  if v_state[1] <> 'full' then
    raise exception
      'support rollback: REFUSING — 20260815a is not fully present (% of 20 objects). Gates 1 and 2 passed, so its enum and its meeting_granted column are correct; something else in it has been altered or removed.',
      v_found[1];
  end if;

  for i in 1..6 loop
    if v_state[i] = 'full' then
      if v_prefix <> i - 1 then
        raise exception
          'support rollback: REFUSING — % is present but an earlier migration in the chain is not. The only recognised states are A, A+B, A+B+C, A+B+C+D, A+B+C+D+E and A-F; a gap is not one of them.',
          v_mig[i];
      end if;
      v_prefix := i;
    end if;
  end loop;

  raise notice 'support rollback — recognised state: prefix of % migration(s), % of 62 approved objects present',
    v_prefix, v_found[1] + v_found[2] + v_found[3] + v_found[4] + v_found[5] + v_found[6];

  -- ═══ GATE 5 — nothing outside the chain may depend on what is about to be
  -- dropped. Resolved through OIDs, not names: the expected objects are looked
  -- up first, then pg_depend is walked from them, and every dependent that
  -- belongs to the chain — its own constraints, indexes, triggers, policies,
  -- column defaults and rewrite rules — is excluded by catalogue lookup.
  --
  -- What survives that filter is, by construction, something a later migration
  -- added: a view over a support table, a foreign key into one, a column typed
  -- with a support enum, or a policy elsewhere calling a support function. Each
  -- of those would make a DROP below fail part-way through; refusing here means
  -- it fails before anything is destroyed, and says what it was.

  select coalesce(array_agg(c.oid), '{}'::oid[]) into v_tab_oids
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r'
    and ('public.' || c.relname) = any(k_a_tables);

  select coalesce(array_agg(t.oid), '{}'::oid[]) into v_typ_oids
  from pg_type t join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = any(k_a_types);

  select coalesce(array_agg(to_regprocedure(sig)::oid), '{}'::oid[]) into v_fn_oids
  from unnest(k_a_funcs || k_b_funcs || k_c_funcs || k_d_funcs || k_e_funcs) sig
  where to_regprocedure(sig) is not null;

  select string_agg(distinct
           E'\n    ' || pg_describe_object(d.classid, d.objid, d.objsubid)
           || '  →  depends on  ' ||
           pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid),
           '')
    into v_foreign
  from pg_depend d
  where d.deptype = 'n'
    and (
         (d.refclassid = 'pg_class'::regclass and d.refobjid = any(v_tab_oids))
      or (d.refclassid = 'pg_type'::regclass  and d.refobjid = any(v_typ_oids))
      or (d.refclassid = 'pg_proc'::regclass  and d.refobjid = any(v_fn_oids))
    )
    and not (
         (d.classid = 'pg_class'::regclass and d.objid = any(v_tab_oids))
      or (d.classid = 'pg_type'::regclass  and d.objid = any(v_typ_oids))
      or (d.classid = 'pg_proc'::regclass  and d.objid = any(v_fn_oids))
      or (d.classid = 'pg_constraint'::regclass and exists (
            select 1 from pg_constraint x
            where x.oid = d.objid and x.conrelid = any(v_tab_oids)))
      or (d.classid = 'pg_trigger'::regclass and exists (
            select 1 from pg_trigger x
            where x.oid = d.objid and x.tgrelid = any(v_tab_oids)))
      or (d.classid = 'pg_attrdef'::regclass and exists (
            select 1 from pg_attrdef x
            where x.oid = d.objid and x.adrelid = any(v_tab_oids)))
      or (d.classid = 'pg_rewrite'::regclass and exists (
            select 1 from pg_rewrite x
            where x.oid = d.objid and x.ev_class = any(v_tab_oids)))
      or (d.classid = 'pg_class'::regclass and exists (
            select 1 from pg_index x
            where x.indexrelid = d.objid and x.indrelid = any(v_tab_oids)))
      -- the chain's own policies: the 15 on its tables, and the 3 that
      -- 20260815e puts on storage.objects, which is not one of its tables.
      or (d.classid = 'pg_policy'::regclass and exists (
            select 1 from pg_policy x
            join pg_class pc      on pc.oid = x.polrelid
            join pg_namespace pns on pns.oid = pc.relnamespace
            where x.oid = d.objid
              and (   x.polrelid = any(v_tab_oids)
                   or (pns.nspname = 'storage' and pc.relname = 'objects'
                       and x.polname = any(k_e_policies)))))
    );

  if v_foreign is not null then
    raise exception
      'support rollback: REFUSING — objects outside the approved chain depend on what this file would drop. Remove or migrate them first, or extend this rollback deliberately. Found:%',
      v_foreign;
  end if;

  -- ═══ The census. Printed before anything is destroyed.
  if to_regclass('public.support_tickets')       is not null then execute 'select count(*) from public.support_tickets'       into n_tickets;  end if;
  if to_regclass('public.support_messages')      is not null then execute 'select count(*) from public.support_messages'      into n_messages; end if;
  if to_regclass('public.support_attachments')   is not null then execute 'select count(*) from public.support_attachments'   into n_attach;   end if;
  if to_regclass('public.support_meetings')      is not null then execute 'select count(*) from public.support_meetings'      into n_meetings; end if;
  if to_regclass('public.support_meeting_slots') is not null then execute 'select count(*) from public.support_meeting_slots' into n_slots;    end if;
  if to_regclass('public.support_articles')      is not null then execute 'select count(*) from public.support_articles'      into n_articles; end if;

  select count(*) into n_objects  from storage.objects        where bucket_id = 'support-attachments';
  select count(*) into n_settings from public.system_settings where key = any(k_f_settings);

  raise notice 'support rollback — destroying: % tickets, % messages, % attachment rows, % meetings, % slots, % articles, % storage objects, % settings rows',
    n_tickets, n_messages, n_attach, n_meetings, n_slots, n_articles, n_objects, n_settings;
end;
$$;

-- ── 1. Storage policies (20260815e) ────────────────────────────────────────
-- Before the function they call, and before the bucket they govern.

drop policy if exists "support attachments: upload own"        on storage.objects;
drop policy if exists "support attachments: read own or agent" on storage.objects;
drop policy if exists "support attachments: delete by agent"   on storage.objects;

-- ── 2. Storage objects and bucket (20260815e) ──────────────────────────────
-- Objects first: storage.objects.bucket_id references storage.buckets, so the
-- bucket cannot go while rows still point at it. Both statements are confined
-- to this one bucket id — no other bucket, payment-proofs included, is
-- reachable from either.

delete from storage.objects where bucket_id = 'support-attachments';
delete from storage.buckets where id        = 'support-attachments';

-- ── 3. Row-level policies (20260815b) ──────────────────────────────────────
-- Revision 3 lists these explicitly. Revisions 1 and 2 did not, on the reasoning
-- that a policy cannot outlive its table so dropping the tables is enough. That
-- reasoning is true and insufficient, and running the file is what showed it:
--
--     ERROR: cannot drop table support_meetings because other objects depend on it
--     DETAIL: policy support_slots_read_bookable on table support_meeting_slots
--             depends on table support_meetings
--
-- A policy is dropped with ITS OWN table, but it can reference ANOTHER one, and
-- that reference is a hard dependency on the other table's DROP. Four of the
-- fifteen cross tables:
--
--   support_messages_read_own       on support_messages    → support_tickets
--   support_attachments_read_own    on support_attachments → support_messages,
--                                                            support_tickets
--   support_attachments_insert_own  on support_attachments → support_messages
--   support_slots_read_bookable     on support_meeting_slots → support_meetings
--
-- The first three point the same way as the foreign keys, so children-first
-- already satisfied them. The fourth points the OPPOSITE way from its FK —
-- support_meetings.slot_id references support_meeting_slots, while the policy on
-- support_meeting_slots reads support_meetings — and that is a cycle no ordering
-- of DROP TABLE can break. Dropping the policies first breaks it, without
-- CASCADE and without guessing.
--
-- All fifteen are listed, not just the four, because "the ones that happen to be
-- load-bearing today" is a list that rots the first time a policy is edited.

drop policy if exists support_articles_read_published  on public.support_articles;
drop policy if exists support_articles_admin_all       on public.support_articles;
drop policy if exists support_tickets_read_own         on public.support_tickets;
drop policy if exists support_tickets_insert_own       on public.support_tickets;
drop policy if exists support_tickets_admin_all        on public.support_tickets;
drop policy if exists support_messages_read_own        on public.support_messages;
drop policy if exists support_messages_insert_own      on public.support_messages;
drop policy if exists support_messages_admin_all       on public.support_messages;
drop policy if exists support_attachments_read_own     on public.support_attachments;
drop policy if exists support_attachments_insert_own   on public.support_attachments;
drop policy if exists support_attachments_admin_all    on public.support_attachments;
drop policy if exists support_slots_read_bookable      on public.support_meeting_slots;
drop policy if exists support_slots_admin_all          on public.support_meeting_slots;
drop policy if exists support_meetings_read_own        on public.support_meetings;
drop policy if exists support_meetings_admin_all       on public.support_meetings;

-- ── 4. Tables (20260815a) ──────────────────────────────────────────────────
-- Children before parents. Each DROP takes with it: that table's indexes, its
-- triggers and its FK constraints. Those are not listed separately because none
-- of them can reference another table's *existence* the way a policy can — an
-- index and a trigger are confined to their own table, so the ordering below is
-- sufficient for them and was not sufficient for the policies above.
--
-- No CASCADE anywhere. If a dependency exists that this file does not know
-- about, the DROP fails and the whole transaction rolls back, which is the
-- correct outcome: a rollback that silently removes an object nobody listed is
-- worse than one that stops. Gate 5 above is what turns that outcome from
-- "fails part-way" into "refuses before starting".

drop table if exists public.support_meetings;
drop table if exists public.support_attachments;
drop table if exists public.support_messages;
drop table if exists public.support_meeting_slots;
drop table if exists public.support_tickets;
drop table if exists public.support_articles;

-- ── 5. Functions ───────────────────────────────────────────────────────────
-- After the tables, because until the tables go, the policies and triggers
-- that reference these functions are live dependencies that block the DROP.
-- Grouped by the migration that created each, so the list can be checked
-- against those files rather than trusted. These 22 signatures are the same
-- ones gate 3 verifies; if one is edited here and not there, the preflight
-- stops recognising the schema, which is the intended coupling.

-- 20260815a — trigger functions
drop function if exists public.support_set_updated_at();
drop function if exists public.support_tickets_guard();
drop function if exists public.support_meetings_guard();
drop function if exists public.support_meetings_consume_grant();

-- 20260815b — policy predicates
drop function if exists public.support_setting_int(text);
drop function if exists public.support_student_can_post(uuid);
drop function if exists public.support_slot_is_open(uuid);

-- 20260815c — the ticket-touch trigger function
drop function if exists public.support_touch_ticket();

-- 20260815d — the RPC boundary
drop function if exists public.support_require_agent();
drop function if exists public.support_assert_meeting_capacity(uuid);
drop function if exists public.support_book_meeting(uuid, uuid);
drop function if exists public.support_cancel_meeting(uuid);
drop function if exists public.admin_support_reply(uuid, text, public.support_ticket_status);
drop function if exists public.admin_support_set_status(uuid, public.support_ticket_status);
drop function if exists public.admin_support_assign(uuid, uuid);
drop function if exists public.admin_support_grant_meeting(uuid);
drop function if exists public.admin_support_revoke_meeting(uuid);
drop function if exists public.admin_support_schedule_for_student(uuid, uuid);
drop function if exists public.admin_support_upsert_slot(jsonb);
drop function if exists public.admin_support_cancel_slot(uuid);
drop function if exists public.admin_support_upsert_article(jsonb);

-- 20260815e — the storage upload predicate
drop function if exists public.support_attachment_upload_allowed(text);

-- ── 6. Types (20260815a) ───────────────────────────────────────────────────
-- Last. Two functions above carry support_ticket_status in their signatures,
-- and every table carried one or more of these in its columns; both are hard
-- dependencies that would refuse these DROPs if they ran earlier.

drop type if exists public.support_category;
drop type if exists public.support_ticket_status;
drop type if exists public.support_sender_role;
drop type if exists public.support_meeting_status;

-- ── 7. Settings rows (20260815f) ───────────────────────────────────────────
-- The only write to a pre-existing table in this file, and the only one that
-- could in principle reach data this feature does not own. Four exact literals,
-- no LIKE and no 'support.%' pattern: a key outside this list cannot match,
-- however it is spelled. Last, so that a failure anywhere above rolls the whole
-- transaction back with these rows still in place.

delete from public.system_settings
where key in (
  'support.reopen_window_days',
  'support.auto_close_after_resolved_days',
  'support.max_active_meetings_per_student',
  'support.meeting_provider'
);

commit;

-- ── VERIFICATION ───────────────────────────────────────────────────────────
--
-- WHY `LIKE 'support%'` APPEARS BELOW BUT NOWHERE IN THE PREFLIGHT. The two
-- uses are not the same claim, and the asymmetry is the point:
--
--   BEFORE the rollback, LIKE would be a weak IDENTITY test — it matches
--   anything that happens to share a prefix, which is exactly the confusion
--   gates 1-4 exist to prevent. So the preflight names every object.
--
--   AFTER the rollback, LIKE is a strong COMPLETENESS test — "no object whose
--   name begins with support survives" is a superset assertion, and it would go
--   red for something the drop list forgot, which an exact-name check by
--   construction cannot do. That is the only place a pattern belongs.
--
-- BEFORE running this file — the exact per-migration census, the same one the
-- preflight computes. Run it to know what you are about to lose and which
-- prefix you are on:
--
--   with want(mig, kind, spec) as (values
--     ('a','type','support_category'), ('a','type','support_ticket_status'),
--     ('a','type','support_sender_role'), ('a','type','support_meeting_status'),
--     ('a','table','public.support_articles'), ('a','table','public.support_tickets'),
--     ('a','table','public.support_messages'), ('a','table','public.support_attachments'),
--     ('a','table','public.support_meeting_slots'), ('a','table','public.support_meetings'),
--     ('a','func','public.support_set_updated_at()'),
--     ('a','func','public.support_tickets_guard()'),
--     ('a','func','public.support_meetings_guard()'),
--     ('a','func','public.support_meetings_consume_grant()'),
--     ('b','func','public.support_setting_int(text)'),
--     ('b','func','public.support_student_can_post(uuid)'),
--     ('b','func','public.support_slot_is_open(uuid)'),
--     ('c','func','public.support_touch_ticket()'),
--     ('d','func','public.support_require_agent()'),
--     ('d','func','public.support_assert_meeting_capacity(uuid)'),
--     ('d','func','public.support_book_meeting(uuid, uuid)'),
--     ('d','func','public.support_cancel_meeting(uuid)'),
--     ('d','func','public.admin_support_reply(uuid, text, public.support_ticket_status)'),
--     ('d','func','public.admin_support_set_status(uuid, public.support_ticket_status)'),
--     ('d','func','public.admin_support_assign(uuid, uuid)'),
--     ('d','func','public.admin_support_grant_meeting(uuid)'),
--     ('d','func','public.admin_support_revoke_meeting(uuid)'),
--     ('d','func','public.admin_support_schedule_for_student(uuid, uuid)'),
--     ('d','func','public.admin_support_upsert_slot(jsonb)'),
--     ('d','func','public.admin_support_cancel_slot(uuid)'),
--     ('d','func','public.admin_support_upsert_article(jsonb)'),
--     ('e','func','public.support_attachment_upload_allowed(text)'))
--   select mig, kind, spec,
--          case kind
--            when 'func'  then to_regprocedure(spec) is not null
--            when 'table' then to_regclass(spec)     is not null
--            else exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
--                         where n.nspname='public' and t.typname=spec and t.typtype='e')
--          end as present
--   from want order by mig, kind, spec;
--   -- every row true = that migration is fully present. Any FALSE in a
--   -- migration whose other rows are TRUE is the drift gate 3 refuses on.
--
-- THE TWO IDENTITY GATES, before running — both must be true or the file will
-- refuse and change nothing:
--
--   select (select array_agg(e.enumlabel::text order by e.enumsortorder)
--           from pg_type t join pg_namespace n on n.oid=t.typnamespace
--           join pg_enum e on e.enumtypid=t.oid
--           where n.nspname='public' and t.typname='support_ticket_status')
--          = array['open','in_progress','awaiting_student','resolved','closed'] as gate1_enum_ours,
--          exists (select 1 from information_schema.columns
--                  where table_schema='public' and table_name='support_tickets'
--                    and column_name='meeting_granted' and data_type='boolean')  as gate2_is_rev4;
--   -- expect: true, true. Either false means this file refuses, in section 0,
--   --         before the first DROP, leaving the schema untouched.
--
-- GATE 5 CAN GO RED, and here is how to make it. Create a dependency the chain
-- does not own, then run the rollback and watch it refuse without dropping
-- anything:
--
--   create view public.support_peek as select id from public.support_tickets;
--   -- run this file → REFUSING, naming "view support_peek → depends on
--   --                 table support_tickets", schema untouched
--   drop view public.support_peek;
--   -- run this file → proceeds
--
--   A check that cannot go red is not evidence, so run both halves.
--
-- AFTER running it — the completeness sweep, where a pattern is the right tool:
--
--   select
--     (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
--       where n.nspname='public' and c.relname like 'support%' and c.relkind='r')   as tables,
--     (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
--       where n.nspname='public' and t.typname like 'support%')                     as types,
--     (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public'
--         and (p.proname like 'support%' or p.proname like 'admin[_]support%'))     as functions,
--     (select count(*) from pg_policies where schemaname='public' and tablename like 'support%') as policies,
--     (select count(*) from pg_policies where schemaname='storage'
--       and policyname like 'support attachments%')                                 as storage_policies,
--     (select count(*) from storage.buckets where id='support-attachments')         as bucket,
--     (select count(*) from public.system_settings where key like 'support.%')      as settings;
--   -- expect: 0, 0, 0, 0, 0, 0, 0 — every one of them, whichever prefix was
--   --         installed. A non-zero here is an object the drop list missed.
--
-- AND the academic side must be untouched. Capture these BEFORE and compare
-- AFTER; the two readings must be identical, because no statement in this file
-- names any of these tables:
--
--   select
--     (select count(*) from public.question_records)  as question_records,
--     (select count(*) from public.mastery_records)   as mastery_records,
--     (select count(*) from public.weakness_signals)  as weakness_signals,
--     (select count(*) from public.chat_sessions)     as chat_sessions,
--     (select count(*) from public.profiles)          as profiles,
--     (select count(*) from auth.users)               as auth_users,
--     (select count(*) from public.system_settings)   as all_settings;
--   -- all identical before and after, EXCEPT all_settings, which falls by
--   -- exactly the number of support.* rows that existed — 4 after the full
--   -- chain, 0 if 20260815f never ran.
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='public.weakness_signals'::regclass and conname like '%source%';
--   -- expect: UNCHANGED, still the three academic sources. This file never
--   --         touched that constraint, and neither did the chain it undoes.
--
--   select id from storage.buckets order by id;
--   -- expect: payment-proofs still present, support-attachments gone
