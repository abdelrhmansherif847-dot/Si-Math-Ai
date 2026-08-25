-- =====================================================================
-- Help & Support · 6 of 6 — starter articles and policy settings
-- =====================================================================
-- STATUS: ✅ APPLIED to production as version 20260816155449 (name: support_seed).
--         Corrected 2026-08-25: this file said "NOT YET APPLIED —
--         awaiting owner approval" while the support system was live
--         in production. The 20260815 filename prefix is the drafting
--         date; the version above is the apply.
--         Revision 2, reconciled against APPROVED 20260815a rev 4,
--         20260815b rev 4, 20260815c rev 3, 20260815d rev 5 and
--         20260815e rev 2.
-- DEPENDS ON: 20260815a — support_articles, support_category
--             20260815b — support_setting_int() reads these rows;
--                         support_student_can_post() is what reopen_window_days
--                         actually gates
--             20260815d — support_assert_meeting_capacity() is what
--                         max_active_meetings_per_student actually gates
--             system_settings already exists (key NN, value NN, description
--             nullable, updated_at NN default now() — verified 2026-08-16)
--
-- WHY THIS EXISTS
-- ---------------
-- An empty help centre teaches students that the help centre is empty, and
-- they never look again. Six starter articles mean the page is useful on the
-- day it ships, and they are the shape an agent copies when writing the
-- seventh. They cover five of the six categories: 'account' carries two,
-- because logging in and the device limit are the two things students actually
-- get stuck on, and 'other' carries none, because it is the catch-all a
-- student picks when no article applied.
--
-- Everything here is EDITABLE from the admin page afterwards. This file is a
-- starting point, not a source of truth: no CI check pins these strings, and
-- correcting one is an admin action, not a migration.
--
-- THE SETTINGS ROWS ARE THE POINT OF THE SECOND HALF
-- --------------------------------------------------
-- THREE behaviours need a product decision that has not been taken — the
-- reopen window, auto-close, and the meeting ceiling. Rather than invent a
-- number and bury it in code, the keys are created here with their meaning
-- documented and their VALUE EMPTY. support_setting_int() reads absent, empty
-- and malformed identically as "no limit", so as shipped:
--
--   * a resolved ticket can always be reopened by replying,
--   * nothing auto-closes; only an agent moves a ticket to 'closed', and
--   * no ceiling applies to how many meetings a student may hold at once.
--
-- Choosing a policy later is an UPDATE on one row. No migration, no deploy,
-- no code change.
--
-- A DESCRIPTION IS THE ONLY THING THE PERSON SETTING A VALUE WILL READ, which
-- is why revision 2 exists: revision 1's descriptions were written before the
-- meeting cap became race-safe and binding on the agent door, and before the
-- reopen window began gating screenshot uploads as well as messages. Both
-- named the wrong function and understated their own reach — an operator
-- deciding whether to set a value would have been misled by the row they were
-- editing. The behaviour was already correct; only the labels lied.
-- =====================================================================

-- ── 1. Starter help-centre articles ────────────────────────────────────────
-- Published immediately: a draft help centre helps nobody. Wording is
-- deliberately plain and answers from the student's side of the screen.

insert into public.support_articles
  (slug, category, question, answer_md, sort_order, published)
values
  ('cant-log-in',
   'account',
   'I can''t log in to my account',
   'Check that you are using the same email you signed up with, then use **Forgot password** on the login page to set a new one.'
   || E'\n\n'
   || 'If the reset email has not arrived after a few minutes, look in your spam folder. Still nothing? Open a ticket under **Account Problem** and tell us the email you are trying — we can see whether the account exists without you sharing your password. Never send us your password; we will never ask for it.',
   10, true),

  ('device-limit-reached',
   'account',
   'I get a "device limit reached" message',
   'Your account can be used on a limited number of devices, which is what stops a shared account being passed around.'
   || E'\n\n'
   || 'Open **Devices** from the sidebar to see everything currently signed in, and remove any you no longer use. If you see a device you do not recognise, remove it, change your password, and open a ticket under **Account Problem** straight away.',
   20, true),

  ('subscription-not-active',
   'billing',
   'I paid but my subscription is not active yet',
   'Manual payments are reviewed by a person, so activation is not instant.'
   || E'\n\n'
   || 'If it has been longer than you expected, open a ticket under **Subscription / Payment** and include the date you paid and the reference you used. Please do not pay a second time — attach a screenshot of the first payment instead and we will trace it.',
   10, true),

  ('mock-exam-lost-progress',
   'mock_exam',
   'My mock exam closed and I lost my progress',
   'Finish a mock exam in one sitting where you can — it is timed, and that is deliberate, because the real exam is too.'
   || E'\n\n'
   || 'If the exam closed because something went wrong rather than because you left, open a ticket under **Mock Exam Problem** with the date and time you started and roughly which question you reached. Attach a screenshot if you have one. We can look at what was recorded.',
   10, true),

  ('how-zero-helps',
   'platform_help',
   'How should I use Chat with Zero?',
   'Send Zero the problem you are stuck on — type it, or take a photo of the question. Zero explains the steps rather than only handing over the answer, so ask follow-up questions when a step does not land.'
   || E'\n\n'
   || 'Zero is your **maths** tutor. For anything about your account, a payment, or something broken on the platform, use this support page instead — Zero cannot see your account or fix technical problems.',
   10, true),

  ('page-not-loading',
   'technical',
   'A page is not loading or looks broken',
   'Refresh first. If that does not help, try a hard refresh (**Ctrl+Shift+R**, or **Cmd+Shift+R** on a Mac), which clears an old cached copy of the page.'
   || E'\n\n'
   || 'Still broken? Open a ticket under **Technical Issue** and tell us which page, what you were doing, and what you saw. A screenshot showing the whole window helps more than a cropped one.',
   10, true)
on conflict (slug) do nothing;

-- ── 2. Product-policy settings, created UNSET ──────────────────────────────
-- system_settings.value is NOT NULL, so "unset" is the empty string. That is
-- exactly what support_setting_int() treats as no limit — along with a
-- malformed value, so a typo here can never silently start closing tickets.

insert into public.system_settings (key, value, description)
values
  ('support.reopen_window_days',
   '',
   'Days after a ticket is resolved during which a student may still add content to it. EMPTY = no limit; a resolved ticket can always be reopened by replying. Read by support_student_can_post(), which gates THREE things, not one: posting a message, registering an attachment row, and uploading the screenshot object itself. Setting a value therefore also stops screenshot uploads on tickets resolved longer ago than the window — intended, and worth knowing before you set it.'),

  ('support.auto_close_after_resolved_days',
   '',
   'Days after which a resolved ticket would auto-close. EMPTY = never; no scheduled job exists and only an agent closes a ticket. Setting a value alone does NOT enable auto-close — the job would still need to be built.'),

  ('support.max_active_meetings_per_student',
   '',
   'Ceiling on simultaneously scheduled meetings per student. EMPTY = no ceiling, which is safe because a meeting requires a grant, a grant is per-ticket, and booking spends it. Read by support_assert_meeting_capacity(), which BOTH booking doors call — support_book_meeting() for the student and admin_support_schedule_for_student() for an agent — so an agent scheduling on a student''s behalf cannot exceed it either. Enforced under a transaction-scoped advisory lock keyed by the student, so concurrent bookings queue rather than slipping past the count.'),

  ('support.meeting_provider',
   'zoom',
   'Which provider adapter the support-actions Edge Function loads when creating a meeting. The only value with an adapter today is zoom.')
on conflict (key) do nothing;

-- ── VERIFICATION (run after apply) ─────────────────────────────────────────
--   select count(*) as total, count(*) filter (where published) as live
--   from support_articles;
--   -- expect: 6, 6   (every seeded article published; a draft help centre
--   --                 helps nobody)
--
--   select category, count(*) from support_articles group by 1 order by 1;
--   -- expect: account 2, billing 1, mock_exam 1, platform_help 1, technical 1
--   --         and NO row for 'other' — it is the catch-all a student picks
--   --         when no article applied, so seeding it would be self-defeating
--
--   -- every seeded row satisfies the constraints 20260815a imposes. Checked
--   -- externally before this file was sent for review, and repeated here so a
--   -- future edit to the copy is checked too:
--   select slug,
--          slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'         as slug_ok,
--          length(btrim(question))  between 3 and 200  as question_ok,
--          length(btrim(answer_md)) between 3 and 8000 as answer_ok
--   from support_articles order by slug;
--   -- expect: true, true, true on all six. Measured question lengths at the
--   --         time of writing: 28-44 of a permitted 200.
--
--   select key, value = '' as unset, description from system_settings
--   where key like 'support.%' order by key;
--   -- expect: 4 rows; the three POLICY keys unset, meeting_provider = 'zoom'
--
--   select support_setting_int('support.reopen_window_days');            -- NULL
--   select support_setting_int('support.auto_close_after_resolved_days');-- NULL
--   select support_setting_int('support.max_active_meetings_per_student');-- NULL
--   select support_setting_int('support.meeting_provider');              -- NULL
--   --   ^ the last one is NOT a policy key. 'zoom' is not an integer, and the
--   --     reader returns NULL rather than raising. The provider is read as
--   --     TEXT by the support-actions Edge Function, never through this helper.
--
--   -- THE DESCRIPTIONS ARE THE DELIVERABLE HERE, so they are assertable too:
--   -- each must name the function that actually reads it, because that is what
--   -- an operator will grep for when deciding whether a value is safe to set.
--   select key,
--          description like '%support_student_can_post%'        as names_reader
--   from system_settings where key = 'support.reopen_window_days';
--   -- expect: true
--   select key,
--          description like '%support_assert_meeting_capacity%' as names_reader,
--          description like '%admin_support_schedule_for_student%' as names_agent_door
--   from system_settings where key = 'support.max_active_meetings_per_student';
--   -- expect: true, true. The second is the one revision 1 failed: it named
--   --         support_book_meeting() only, so an operator would have concluded
--   --         the ceiling did not bind an agent — which was true of revision 2
--   --         of 20260815d and is false of the approved revision 5.
