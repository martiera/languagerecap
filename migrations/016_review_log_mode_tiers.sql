ALTER TABLE vocabulary_review_log
  ADD COLUMN IF NOT EXISTS mode_tier_before SMALLINT,
  ADD COLUMN IF NOT EXISTS mode_tier_after SMALLINT;

ALTER TABLE vocabulary_review_log
  DROP CONSTRAINT IF EXISTS vocabulary_review_log_mode_tier_before_check,
  DROP CONSTRAINT IF EXISTS vocabulary_review_log_mode_tier_after_check,
  ADD CONSTRAINT vocabulary_review_log_mode_tier_before_check
    CHECK (mode_tier_before BETWEEN 0 AND 4),
  ADD CONSTRAINT vocabulary_review_log_mode_tier_after_check
    CHECK (mode_tier_after BETWEEN 0 AND 4);
