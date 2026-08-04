-- POINT-IN-TIME SNAPSHOT of every value the server-side streak change can alter.
-- Captured from production 2026-08-04, immediately before applying
-- 20260804_streak_server_side.sql. 24 profiles, matching the runbook baseline
-- (sum_current 19, sum_best 44, max_best 17).
--
-- WHY THIS EXISTS
-- No MCP tool exposes Supabase's platform backup/PITR status, so backup coverage
-- could not be *verified* from this session — only asserted, which is worse than
-- useless in a runbook. This file is a verifiable substitute for the specific
-- blast radius of this change.
--
-- It is deliberately narrow, and that is defensible because the migration itself
-- writes ZERO data rows: it adds a column, creates a function and two indexes,
-- and revokes grants. Nothing is dropped, deleted, retyped or rewritten. The only
-- data that can change is what recompute_streak() writes the first time it runs
-- for each student — i.e. exactly the three columns below.
--
-- NOT captured, because the change cannot damage them:
--   * achievements — inserted ON CONFLICT DO NOTHING, never updated or deleted.
--   * question_records / exam_practice_sessions / focus_tasks — read only.
--
-- TO RESTORE (only after applying the rollback migration, which re-grants the
-- columns; otherwise these UPDATEs are refused for a non-owner role):
--   run the statements below as service_role.
--
-- Note that restoring is rarely the right move: a streak that CHANGED for a
-- student outside Egypt is the timezone correction this work exists to make, not
-- damage. See the rollback decision rule in streak-migration-runbook.md §9.

UPDATE public.profiles SET current_streak=0, best_streak=0, last_active_date=NULL WHERE id='1e3e5b5e-b988-4203-ab27-681a3bcf8401';
UPDATE public.profiles SET current_streak=0, best_streak=0, last_active_date=NULL WHERE id='38fe8dbd-63b2-46b1-ba51-616d0d87bc92';
UPDATE public.profiles SET current_streak=0, best_streak=0, last_active_date=NULL WHERE id='416c7a99-5c98-440b-b14a-1cb19cf21d67';
UPDATE public.profiles SET current_streak=0, best_streak=0, last_active_date=NULL WHERE id='43d2cb65-fac6-4690-817b-e540199405fb';
UPDATE public.profiles SET current_streak=0, best_streak=0, last_active_date=NULL WHERE id='ad25619a-6aef-4d32-a935-e5fc57ce2ebe';
UPDATE public.profiles SET current_streak=0, best_streak=0, last_active_date=NULL WHERE id='ae957a44-94ae-4004-9fb2-958e01f717d8';
UPDATE public.profiles SET current_streak=0, best_streak=1, last_active_date=NULL WHERE id='0453987a-afc0-4c41-88b2-b91232c09d72';
UPDATE public.profiles SET current_streak=0, best_streak=1, last_active_date=NULL WHERE id='831ba31b-48f7-4606-81f3-9680065b6d07';
UPDATE public.profiles SET current_streak=0, best_streak=1, last_active_date=NULL WHERE id='fbcc4e21-0fc9-46dd-a7c6-78732966211b';
UPDATE public.profiles SET current_streak=0, best_streak=4, last_active_date=NULL WHERE id='54af8696-285d-460d-891b-cc6801ec6d73';
UPDATE public.profiles SET current_streak=1, best_streak=1, last_active_date='2026-06-20' WHERE id='68440e68-e52d-48b6-9f3c-b86cd8c09c77';
UPDATE public.profiles SET current_streak=1, best_streak=1, last_active_date='2026-06-21' WHERE id='d60ae0b9-2827-430a-9d03-bfa9bd65d21e';
UPDATE public.profiles SET current_streak=1, best_streak=1, last_active_date='2026-07-02' WHERE id='a7730f83-75ac-4bc3-841a-cb72b8c428ba';
UPDATE public.profiles SET current_streak=1, best_streak=1, last_active_date='2026-07-02' WHERE id='ea8f6bb9-f92b-40e6-8b13-8b26d88d4285';
UPDATE public.profiles SET current_streak=1, best_streak=1, last_active_date='2026-07-09' WHERE id='b0c6faa7-1135-4941-b79f-aa03ab744743';
UPDATE public.profiles SET current_streak=1, best_streak=1, last_active_date='2026-07-10' WHERE id='02696143-5ed3-4ad7-b9a4-b616bd73f291';
UPDATE public.profiles SET current_streak=1, best_streak=1, last_active_date='2026-07-10' WHERE id='d634a21d-84be-4429-8c8a-d032b67867b4';
UPDATE public.profiles SET current_streak=1, best_streak=1, last_active_date='2026-08-03' WHERE id='c57eac89-831c-400c-a1fa-5db8475c81d4';
UPDATE public.profiles SET current_streak=1, best_streak=17, last_active_date='2026-08-04' WHERE id='e5570d10-260e-431e-b32d-7d1d0dcab720';
UPDATE public.profiles SET current_streak=1, best_streak=2, last_active_date='2026-06-17' WHERE id='0469b960-935c-4f28-b8c5-81d6f7579135';
UPDATE public.profiles SET current_streak=1, best_streak=2, last_active_date='2026-07-26' WHERE id='bfc32020-a393-4354-9856-458483284a3d';
UPDATE public.profiles SET current_streak=2, best_streak=2, last_active_date='2026-07-19' WHERE id='b38a191c-a185-4257-85fc-63cc89b175ae';
UPDATE public.profiles SET current_streak=3, best_streak=3, last_active_date='2026-07-02' WHERE id='c2d8c684-711f-42c5-9c90-e636b526daf7';
UPDATE public.profiles SET current_streak=3, best_streak=3, last_active_date='2026-08-04' WHERE id='6b9a2f4b-26ab-4e29-aee3-dce9b116065e';
