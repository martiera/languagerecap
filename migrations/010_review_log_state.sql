ALTER TABLE vocabulary_review_log
  DROP CONSTRAINT IF EXISTS vocabulary_review_log_card_type_check;

UPDATE vocabulary_review_log
SET card_type = 'recognition'
WHERE card_type = 'vocabulary';

ALTER TABLE vocabulary_review_log
  ADD COLUMN IF NOT EXISTS due_before TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS difficulty_before DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS difficulty_after DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS learning_step_before INTEGER,
  ADD COLUMN IF NOT EXISTS learning_step_after INTEGER,
  ADD COLUMN IF NOT EXISTS reps_before INTEGER,
  ADD COLUMN IF NOT EXISTS reps_after INTEGER,
  ADD COLUMN IF NOT EXISTS lapses_before INTEGER,
  ADD COLUMN IF NOT EXISTS lapses_after INTEGER,
  ADD COLUMN IF NOT EXISTS leech_before BOOLEAN,
  ADD COLUMN IF NOT EXISTS leech_after BOOLEAN,
  ADD COLUMN IF NOT EXISTS algorithm TEXT NOT NULL DEFAULT 'ladder',
  ADD COLUMN IF NOT EXISTS applied_fuzz_ratio DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS answer_source TEXT NOT NULL DEFAULT 'typed';

ALTER TABLE vocabulary_review_log
  ADD CONSTRAINT vocabulary_review_log_card_type_check
    CHECK (card_type IN ('recognition', 'production', 'cloze'));
