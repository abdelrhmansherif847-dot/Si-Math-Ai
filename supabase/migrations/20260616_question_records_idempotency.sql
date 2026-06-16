-- CAI-P1: client-side idempotency for question_records.
--
-- Adds a nullable client-generated UUID. Existing rows remain NULL and are
-- unaffected by the partial unique index. New sends include a client_request_id;
-- retries on network failure reuse the same key and converge to a single row
-- via 23505 recovery in the Edge Function.
--
-- Backward compatibility: zero existing rows are mutated. Old clients that
-- omit client_request_id continue to insert successfully (NULL passes the
-- partial index). The column and index can be dropped without data loss.

ALTER TABLE question_records
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_question_records_user_request
  ON question_records (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
