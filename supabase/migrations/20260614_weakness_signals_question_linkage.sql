-- Phase 7 — Question Linkage
-- Adds traceability columns to weakness_signals so every signal can be
-- traced back to its originating question record or exam mistake.
--
-- Soft references (no FK constraints) because:
--   * source_question_id is polymorphic: points to question_records (AI_CHAT)
--     or exam_mistakes (MOCK_EXAM) depending on the source column.
--   * All existing rows retain NULL — additive, non-destructive.
--   * Chat linkage uses signal buffering: signals are batch-inserted after
--     askAI() resolves so source_question_id is known at insert time (no back-fill).
--
-- source_question_id: for AI_CHAT → question_records.id (= record_id from edge fn)
--                     for MOCK_EXAM → exam_mistakes.question_id when available
-- source_session_id:  for AI_CHAT → chat_sessions.id (currentSessionId at flush)
--                     for MOCK_EXAM → sessionId param to ExamMistakesLogger.process()

ALTER TABLE weakness_signals
  ADD COLUMN IF NOT EXISTS source_question_id UUID,
  ADD COLUMN IF NOT EXISTS source_session_id  UUID;

COMMENT ON COLUMN weakness_signals.source_question_id IS
  'UUID of the originating record. For AI_CHAT signals: question_records.id
   (= record_id returned by the ai-tutor edge function). For MOCK_EXAM signals:
   exam_mistakes.question_id when available. Nullable; NULL for signals created
   before Phase 7 or when no question record exists.';

COMMENT ON COLUMN weakness_signals.source_session_id IS
  'UUID of the chat_sessions or exam session in which this signal was generated.
   For AI_CHAT: chat_sessions.id (currentSessionId at flush time).
   For MOCK_EXAM: the sessionId parameter passed to ExamMistakesLogger.process().
   Nullable; NULL for signals created before Phase 7.';

CREATE INDEX IF NOT EXISTS idx_weakness_signals_source_question
  ON weakness_signals (source_question_id)
  WHERE source_question_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_weakness_signals_source_session
  ON weakness_signals (source_session_id)
  WHERE source_session_id IS NOT NULL;
