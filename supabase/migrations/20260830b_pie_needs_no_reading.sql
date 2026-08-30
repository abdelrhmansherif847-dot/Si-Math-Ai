-- =====================================================================
-- APPLIED 2026-08-30 as version 20260830022108, after individual approval.
-- The second half of pie support, found by trying to insert one.
--
-- Verified in production immediately after applying, by asking the function
-- itself about every stimulus shape the schema allows. Only the pie moved:
--
--   chart / bar        true   (unchanged)   plot / graph   true  (unchanged)
--   chart / line       true   (unchanged)   plot / data    true  (unchanged)
--   chart / pie       FALSE   (was true)    plot / plane   false (unchanged)
--   table              false  (unchanged)   number_line    false (unchanged)
--
-- The insert it unblocked went in the same day: one shared pie stimulus, two
-- questions pointing at it, both with reading NULL.
-- =====================================================================
--
-- 20260830a made a pie STORABLE. This makes it insertable.
--
-- exam_stimulus_needs_reading answers "does this stimulus render differently
-- depending on the question asked?", and a trigger refuses any question whose
-- `reading` disagrees with it. Its rule is `k = 'chart'` — true for every
-- chart, because until now every chart had an axis, and whether a value must be
-- read off one decides whether it is ruled.
--
-- A PIE IS THE EXCEPTION. It names every slice on the figure itself, with its
-- share, so there is nothing left for a question to select. The renderer says
-- exactly this (needsReading in exam-stimulus.core.js returns false for a pie),
-- and the database has to agree or the two disagree about what a valid row is:
-- a pie question with reading NULL is refused by the trigger, and one with a
-- reading is refused by the renderer. Neither can be authored.
--
-- Found by inserting one, which is the only way it could have been found.
--
-- One clause. Nothing else changes: every chart with an axis still requires a
-- reading, every plot rule is untouched, and no existing row's validity moves —
-- there are no pie rows yet, because this is what stops them existing.
--
-- Rollback: 20260830b_pie_needs_no_reading_rollback.sql

create or replace function public.exam_stimulus_needs_reading(k text, s jsonb)
returns boolean language sql immutable parallel safe as $$
  select coalesce(
    (k = 'chart' and coalesce(s ->> 'chartType', '') <> 'pie')
    or (k = 'plot' and (s ->> 'frame') in ('graph', 'data')),
    false);
$$;
