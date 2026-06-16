-- ME-P1: client-side idempotency for exam_practice_sessions.
--
-- Adds a nullable client-generated UUID. Existing rows remain NULL and are
-- unaffected by the partial unique index. New client submissions include a
-- key; retries on network failure reuse the same key and converge to a
-- single session row via 23505 recovery on the client.
--
-- Backward compatibility: zero existing rows are mutated. Old clients that
-- omit idempotency_key continue to insert successfully (NULL passes the
-- partial index). The column and index can be dropped without data loss.

ALTER TABLE exam_practice_sessions
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_exam_sessions_user_idempotency
  ON exam_practice_sessions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
