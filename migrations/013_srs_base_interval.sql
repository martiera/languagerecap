ALTER TABLE user_lexemes
  ADD COLUMN IF NOT EXISTS srs_base_interval_days DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE user_lexemes
SET srs_base_interval_days = CASE
  WHEN srs_stability_days <= 2 THEN 1
  WHEN srs_stability_days <= 5 THEN 3
  WHEN srs_stability_days <= 11.5 THEN 7
  WHEN srs_stability_days <= 25.5 THEN 16
  WHEN srs_stability_days <= 55 THEN 35
  WHEN srs_stability_days <= 112.5 THEN 75
  WHEN srs_stability_days > 0 THEN 150
  ELSE 0
END
WHERE srs_base_interval_days = 0
  AND srs_stability_days > 0;

ALTER TABLE vocabulary_review_log
  ADD COLUMN IF NOT EXISTS base_interval_before_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_interval_after_days DOUBLE PRECISION NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vocabulary_review_log_base_interval_check'
  ) THEN
    ALTER TABLE vocabulary_review_log
      ADD CONSTRAINT vocabulary_review_log_base_interval_check
        CHECK (base_interval_before_days >= 0 AND base_interval_after_days >= 0);
  END IF;
END $$;
