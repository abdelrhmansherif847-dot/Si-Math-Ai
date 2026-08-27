-- Rollback for 20260827b_plot_figures.sql.
--
-- Safe only while no stored plot depends on figures[] being validated:
--   select count(*) from public.exam_stimuli where kind = 'plot';   -- expect 0
-- A plot stored under the new validator keeps its figures key; the previous
-- validator tolerates it as an unvalidated extra, which is exactly the state
-- this migration was written to end.

begin;

-- Restore the 20260827a validator: the plot branch loses `figures` from its
-- presence list and drops the exam_plot_figures_ok call. Re-run that file's
-- definition rather than transcribing it here, so the two cannot drift.
\echo 'NOW re-run the exam_stimulus_spec_ok definition from 20260827a_stimulus_reading.sql'

drop function if exists public.exam_plot_figures_ok(jsonb);
drop function if exists public.exam_plot_frame_mode_ok(text, text);

commit;
